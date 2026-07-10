import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  getFallbackExchangeRates,
  loadCatalogExchangeRates,
} from '@/lib/routing/exchange-rates'
import {
  computeItuRevenue,
  loadRoutingCostsForItuRows,
  resolveItuAmountsForRow,
  unwrapTransaction,
} from '@/lib/admin/itu-revenue'
import { translatePlanTextToEnglish } from '@/lib/catalog/plan-text-english'

/** Admin dashboard always reports in EUR with English labels. */
const ADMIN_REPORTING_CURRENCY = 'EUR'

export type DashboardTopProduct = {
  product_name: string
  operator_name: string
  plan_id: string | null
  orders: number
  revenue: number
  margin: number
  currency: string
}

export type DashboardDailySale = {
  day: string
  currency: string
  revenue: number
  margin: number
  orders: number
  completed_orders: number
}

export type DashboardSummary = {
  /** ITU Revenue = Gross − Refunds − Provider Cost (EUR) */
  total_revenue: number
  /** Alias of total_revenue for older UI bindings */
  total_margin: number
  gross_revenue: number
  refunds: number
  provider_cost: number
  itu_revenue: number
  total_orders: number
  completed_orders: number
  failed_orders: number
  pending_orders: number
  total_users: number
  total_operators: number
  total_plans: number
  total_countries: number
  catalog_synced_at: string | null
  reporting_currency: string
  margin_by_currency: Record<string, number>
}

export type DashboardMetrics = {
  summary: DashboardSummary
  sales: DashboardDailySale[]
  topProducts: DashboardTopProduct[]
}

type TransactionEmbed = {
  amount: number | string | null
  currency: string | null
  status: string | null
  metadata: Record<string, unknown> | null
}

type RechargeRow = {
  id: string
  status: string
  product_name: string | null
  operator_name: string | null
  sku_code: string | null
  plan_id: string | null
  created_at: string
  transaction_id: string | null
  transactions: TransactionEmbed | TransactionEmbed[] | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

function extractPlanId(row: RechargeRow): string {
  const fromRow = row.plan_id?.trim() || row.sku_code?.trim()
  if (fromRow) return fromRow

  const txn = unwrapTransaction(row)
  const meta = txn?.metadata
  if (!meta) return ''

  for (const key of ['system_plan_id', 'plan_id', 'planId'] as const) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

function resolveProductDisplayName(
  productName: string | null | undefined,
  planId: string | null | undefined,
  nameMap: Map<string, string>,
): string {
  const name = productName?.trim()
  if (name && !looksLikeUuid(name)) return name

  const id = planId?.trim()
  if (id && nameMap.has(id)) return nameMap.get(id)!

  if (name) return name
  if (id) return id

  return 'Unknown plan'
}

async function resolvePlanNameMap(planIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(planIds.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return map

  const chunkSize = 80
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const inList = chunk.map(encodeURIComponent).join(',')

    const [systemRes, internalRes, systemByInternalRes] = await Promise.all([
      supabaseRest(`system_plans?id=in.(${inList})&select=id,system_plan_name`, { cache: 'no-store' }),
      supabaseRest(`internal_plans?id=in.(${inList})&select=id,uti_plan_name`, { cache: 'no-store' }),
      supabaseRest(
        `system_plans?internal_plan_id=in.(${inList})&select=internal_plan_id,system_plan_name`,
        { cache: 'no-store' },
      ),
    ])

    if (systemRes.ok) {
      const rows = (await systemRes.json()) as Array<{ id: string; system_plan_name?: string | null }>
      for (const row of rows) {
        const label = row.system_plan_name?.trim()
        if (row.id && label) map.set(row.id, label)
      }
    }

    if (internalRes.ok) {
      const rows = (await internalRes.json()) as Array<{ id: string; uti_plan_name?: string | null }>
      for (const row of rows) {
        const label = row.uti_plan_name?.trim()
        if (row.id && label && !map.has(row.id)) map.set(row.id, label)
      }
    }

    if (systemByInternalRes.ok) {
      const rows = (await systemByInternalRes.json()) as Array<{
        internal_plan_id?: string | null
        system_plan_name?: string | null
      }>
      for (const row of rows) {
        const id = row.internal_plan_id?.trim()
        const label = row.system_plan_name?.trim()
        if (id && label && !map.has(id)) map.set(id, label)
      }
    }
  }

  return map
}

function numberFrom(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function fetchExactCount(table: string, filter = ''): Promise<number> {
  const query = filter ? `${table}?${filter}&select=id&limit=1` : `${table}?select=id&limit=1`
  const res = await supabaseRest(query, {
    headers: { Prefer: 'count=exact' },
    cache: 'no-store',
  })
  if (!res.ok) return 0
  const range = res.headers.get('Content-Range')
  if (!range) return 0
  const total = range.split('/')[1]
  return parseInt(total ?? '0', 10) || 0
}

type CatalogCoverageStats = {
  total_operators: number
  total_plans: number
  total_countries: number
  catalog_synced_at: string | null
}

/** Countries with at least one system operator that has at least one system plan. */
async function fetchCatalogCoverageStats(): Promise<CatalogCoverageStats> {
  const [totalOperators, totalPlans, latestOperatorRes, latestPlanRes] = await Promise.all([
    fetchExactCount('system_operators'),
    fetchExactCount('system_plans'),
    supabaseRest('system_operators?select=updated_at&order=updated_at.desc&limit=1', { cache: 'no-store' }),
    supabaseRest('system_plans?select=updated_at&order=updated_at.desc&limit=1', { cache: 'no-store' }),
  ])

  let catalogSyncedAt: string | null = null
  const syncCandidates: string[] = []
  if (latestOperatorRes.ok) {
    const rows = (await latestOperatorRes.json()) as Array<{ updated_at?: string }>
    if (rows[0]?.updated_at) syncCandidates.push(rows[0].updated_at)
  }
  if (latestPlanRes.ok) {
    const rows = (await latestPlanRes.json()) as Array<{ updated_at?: string }>
    if (rows[0]?.updated_at) syncCandidates.push(rows[0].updated_at)
  }
  if (syncCandidates.length > 0) {
    catalogSyncedAt = syncCandidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
  }

  const operatorCountry = new Map<string, string>()
  const pageSize = 1000
  let offset = 0
  while (true) {
    const res = await supabaseRest(
      `system_operators?select=id,country_id&limit=${pageSize}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const batch = (await res.json()) as Array<{ id: string; country_id: string | null }>
    for (const row of batch) {
      if (row.id && row.country_id) {
        operatorCountry.set(row.id, row.country_id.trim().toUpperCase())
      }
    }
    if (batch.length < pageSize) break
    offset += pageSize
  }

  const countriesWithOperatorAndPlan = new Set<string>()
  offset = 0
  while (true) {
    const res = await supabaseRest(
      `system_plans?select=system_operator_id&limit=${pageSize}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const batch = (await res.json()) as Array<{ system_operator_id: string | null }>
    for (const row of batch) {
      const country = row.system_operator_id ? operatorCountry.get(row.system_operator_id) : null
      if (country) countriesWithOperatorAndPlan.add(country)
    }
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return {
    total_operators: totalOperators,
    total_plans: totalPlans,
    total_countries: countriesWithOperatorAndPlan.size,
    catalog_synced_at: catalogSyncedAt,
  }
}

async function fetchAllRechargeRows(): Promise<RechargeRow[]> {
  const pageSize = 500
  const rows: RechargeRow[] = []
  let offset = 0

  while (true) {
    const res = await supabaseRest(
      `recharge_orders?select=id,status,product_name,operator_name,sku_code,plan_id,created_at,transaction_id,transactions(amount,currency,status,metadata)&status=neq.pending_payment&order=created_at.asc&limit=${pageSize}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const batch = (await res.json()) as RechargeRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return rows
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

export async function loadAdminDashboardMetrics(): Promise<DashboardMetrics> {
  const [rechargeRows, totalUsers, catalog, rateMap] = await Promise.all([
    fetchAllRechargeRows(),
    fetchExactCount('profiles', 'app_role=eq.user'),
    fetchCatalogCoverageStats(),
    loadCatalogExchangeRates(ADMIN_REPORTING_CURRENCY),
  ])

  const fallbackRates = getFallbackExchangeRates()
  const reportingCurrency = ADMIN_REPORTING_CURRENCY

  const routingCosts = await loadRoutingCostsForItuRows(rechargeRows)

  let completedOrders = 0
  let failedOrders = 0
  let pendingOrders = 0
  let grossReporting = 0
  let refundsReporting = 0
  let providerCostReporting = 0
  const marginByCurrency: Record<string, number> = {}
  const dailyMap = new Map<string, DashboardDailySale>()
  const productMap = new Map<string, DashboardTopProduct>()

  // Match Financial / Transactions / Reports: unpaid checkouts are not recharges.
  const countedRows = rechargeRows.filter(
    (row) => (row.status ?? '').toLowerCase() !== 'pending_payment',
  )

  for (const row of countedRows) {
    const status = (row.status ?? '').toLowerCase()
    if (status === 'completed') completedOrders += 1
    else if (status === 'failed') failedOrders += 1
    else pendingOrders += 1

    const itu = resolveItuAmountsForRow(
      row,
      reportingCurrency,
      rateMap,
      fallbackRates,
      routingCosts,
    )

    grossReporting += itu.grossReporting
    refundsReporting += itu.refundReporting
    providerCostReporting += itu.costReporting

    if (itu.marginNative > 0) {
      marginByCurrency[itu.paidCurrency] = (marginByCurrency[itu.paidCurrency] ?? 0) + itu.marginNative
    }

    const day = dayKey(row.created_at)
    const dailyKey = `${day}:${itu.paidCurrency}`
    const dailyExisting =
      dailyMap.get(dailyKey) ??
      ({
        day,
        currency: itu.paidCurrency,
        revenue: 0,
        margin: 0,
        orders: 0,
        completed_orders: 0,
      } satisfies DashboardDailySale)

    dailyExisting.orders += 1
    if (status === 'completed') {
      dailyExisting.completed_orders += 1
      dailyExisting.revenue += itu.paidAmount
      dailyExisting.margin += itu.marginNative
    }
    dailyMap.set(dailyKey, dailyExisting)

    const planId = extractPlanId(row)
    const operatorName = (row.operator_name ?? 'Unknown').trim() || 'Unknown'
    const productKey = planId ? `${planId}::${operatorName}` : `${(row.product_name ?? row.sku_code ?? 'Unknown').trim()}::${operatorName}`
    const productExisting =
      productMap.get(productKey) ??
      ({
        product_name: row.product_name?.trim() || planId || 'Unknown plan',
        operator_name: operatorName,
        plan_id: planId || null,
        orders: 0,
        revenue: 0,
        margin: 0,
        currency: itu.paidCurrency,
      } satisfies DashboardTopProduct)

    if (status === 'completed') {
      productExisting.orders += 1
      productExisting.revenue += itu.grossReporting
      productExisting.margin += itu.marginReporting
    }
    productExisting.currency = reportingCurrency
    productMap.set(productKey, productExisting)
  }

  const sales = [...dailyMap.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 30)

  const rankedProducts = [...productMap.values()]
    .filter((p) => p.orders > 0)
    .sort((a, b) => b.margin - a.margin || b.orders - a.orders)
    .slice(0, 3)

  const planNameMap = await resolvePlanNameMap(
    rankedProducts.map((p) => p.plan_id).filter((id): id is string => Boolean(id)),
  )

  const topProducts = rankedProducts.map((product) => ({
    ...product,
    product_name: translatePlanTextToEnglish(
      resolveProductDisplayName(product.product_name, product.plan_id, planNameMap),
    ),
    currency: reportingCurrency,
  }))

  const ituRevenue = computeItuRevenue({
    grossReporting,
    refundsReporting,
    providerCostReporting,
  })

  const summary: DashboardSummary = {
    total_revenue: ituRevenue,
    total_margin: ituRevenue,
    gross_revenue: parseFloat(grossReporting.toFixed(2)),
    refunds: parseFloat(refundsReporting.toFixed(2)),
    provider_cost: parseFloat(providerCostReporting.toFixed(2)),
    itu_revenue: ituRevenue,
    total_orders: countedRows.length,
    completed_orders: completedOrders,
    failed_orders: failedOrders,
    pending_orders: pendingOrders,
    total_users: totalUsers,
    total_operators: catalog.total_operators,
    total_plans: catalog.total_plans,
    total_countries: catalog.total_countries,
    catalog_synced_at: catalog.catalog_synced_at,
    reporting_currency: reportingCurrency,
    margin_by_currency: marginByCurrency,
  }

  return { summary, sales, topProducts }
}
