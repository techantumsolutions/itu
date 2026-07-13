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
import { resolveAdminTransactionDateRange } from '@/lib/admin/admin-transaction-date-range'
import { translatePlanTextToEnglish } from '@/lib/catalog/plan-text-english'
import {
  extractPlanIdFromSources,
  resolvePlanNameMap,
  resolveProductDisplayName,
} from '@/lib/admin/plan-name-resolver'

/** Admin dashboard always reports in EUR with English labels. */
const ADMIN_REPORTING_CURRENCY = 'EUR'

export type DashboardDateFilter = 'today' | 'week' | 'month' | 'year' | 'all'

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
  /** ITU Profit = Gross − Refunds − Payment Gateway − Provider Cost (EUR) */
  total_revenue: number
  /** Alias of total_revenue / itu_revenue for older UI bindings */
  total_margin: number
  gross_revenue: number
  refunds: number
  payment_gateway_fees: number
  provider_cost: number
  /** ITU Profit (same as total_revenue) */
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
  date_filter: DashboardDateFilter
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
  payment_status?: string | null
  product_name: string | null
  operator_name: string | null
  sku_code: string | null
  plan_id: string | null
  created_at: string
  transaction_id: string | null
  send_amount?: number | string | null
  send_currency?: string | null
  receive_amount?: number | string | null
  receive_currency?: string | null
  transactions: TransactionEmbed | TransactionEmbed[] | null
}

function extractPlanId(row: RechargeRow): string {
  const txn = unwrapTransaction(row)
  return extractPlanIdFromSources({
    planId: row.plan_id,
    skuCode: row.sku_code,
    productName: row.product_name,
    metadata: txn?.metadata ?? null,
  })
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

async function fetchAllRechargeRows(dateFilter: DashboardDateFilter): Promise<RechargeRow[]> {
  const pageSize = 500
  const rows: RechargeRow[] = []
  let offset = 0
  const range = resolveAdminTransactionDateRange(dateFilter)
  const dateParts: string[] = []
  if (range.start) dateParts.push(`created_at=gte.${encodeURIComponent(range.start.toISOString())}`)
  if (range.end) dateParts.push(`created_at=lte.${encodeURIComponent(range.end.toISOString())}`)
  const dateQuery = dateParts.length > 0 ? `&${dateParts.join('&')}` : ''

  while (true) {
    const res = await supabaseRest(
      `recharge_orders?select=id,status,payment_status,product_name,operator_name,sku_code,plan_id,created_at,transaction_id,send_amount,send_currency,receive_amount,receive_currency,transactions(amount,currency,status,metadata)&status=neq.pending_payment${dateQuery}&order=created_at.asc&limit=${pageSize}&offset=${offset}`,
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

function normalizeDashboardDateFilter(date?: string | null): DashboardDateFilter {
  const key = (date ?? 'today').trim().toLowerCase()
  if (key === 'week' || key === 'month' || key === 'year' || key === 'all' || key === 'today') {
    return key
  }
  return 'today'
}

export async function loadAdminDashboardMetrics(options?: {
  date?: string | null
}): Promise<DashboardMetrics> {
  const dateFilter = normalizeDashboardDateFilter(options?.date)
  const [rechargeRows, totalUsers, catalog, rateMap] = await Promise.all([
    fetchAllRechargeRows(dateFilter),
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
  let gatewayFeesReporting = 0
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
    gatewayFeesReporting += itu.gatewayFeeReporting
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
      productExisting.margin += itu.ituContribution
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

  const ituProfit = computeItuRevenue({
    grossReporting,
    refundsReporting,
    providerCostReporting,
    gatewayFeesReporting,
  })

  const summary: DashboardSummary = {
    total_revenue: ituProfit,
    total_margin: ituProfit,
    gross_revenue: parseFloat(grossReporting.toFixed(2)),
    refunds: parseFloat(refundsReporting.toFixed(2)),
    payment_gateway_fees: parseFloat(gatewayFeesReporting.toFixed(2)),
    provider_cost: parseFloat(providerCostReporting.toFixed(2)),
    itu_revenue: ituProfit,
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
    date_filter: dateFilter,
  }

  return { summary, sales, topProducts }
}
