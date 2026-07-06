import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  convertWithRateMap,
  getFallbackExchangeRates,
  LCR_BASE_CURRENCY,
  loadCatalogExchangeRates,
} from '@/lib/routing/exchange-rates'
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
  total_revenue: number
  total_margin: number
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

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? LCR_BASE_CURRENCY).trim().toUpperCase() || LCR_BASE_CURRENCY
}

function numberFrom(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function unwrapTransaction(row: RechargeRow): TransactionEmbed | null {
  if (!row.transactions) return null
  return Array.isArray(row.transactions) ? row.transactions[0] ?? null : row.transactions
}

function extractProviderCost(meta: Record<string, unknown> | null | undefined): {
  cost: number | null
  currency: string | null
} {
  if (!meta) return { cost: null, currency: null }

  if (typeof meta.selected_provider_cost === 'number' && Number.isFinite(meta.selected_provider_cost)) {
    return {
      cost: meta.selected_provider_cost,
      currency: typeof meta.selected_provider_currency === 'string' ? meta.selected_provider_currency : null,
    }
  }

  const lcr = meta.lcr_result as Record<string, unknown> | undefined
  if (lcr && typeof lcr.selectedProviderCost === 'number' && Number.isFinite(lcr.selectedProviderCost)) {
    return {
      cost: lcr.selectedProviderCost,
      currency: typeof lcr.selectedProviderCurrency === 'string' ? lcr.selectedProviderCurrency : null,
    }
  }

  const routing = meta.routing_result as Record<string, unknown> | undefined
  if (routing) {
    if (typeof routing.selected_provider_cost === 'number') {
      return {
        cost: routing.selected_provider_cost,
        currency:
          typeof routing.selected_provider_currency === 'string' ? routing.selected_provider_currency : null,
      }
    }
    const evaluated = routing.evaluated_providers
    const selectedId = routing.selected_provider
    if (Array.isArray(evaluated) && selectedId) {
      const match = evaluated.find(
        (p) =>
          p &&
          typeof p === 'object' &&
          ((p as { providerId?: string }).providerId === selectedId ||
            (p as { provider_id?: string }).provider_id === selectedId),
      ) as { provider_wholesale_amount?: number; provider_wholesale_currency?: string; price?: number; currency?: string } | undefined
      if (match) {
        const cost = match.provider_wholesale_amount ?? match.price
        if (typeof cost === 'number' && Number.isFinite(cost)) {
          return {
            cost,
            currency: match.provider_wholesale_currency ?? match.currency ?? null,
          }
        }
      }
    }
  }

  return { cost: null, currency: null }
}

function toReportingAmount(
  amount: number,
  currency: string,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): number {
  const { converted } = convertWithRateMap(amount, currency, reportingCurrency, rateMap, fallbackRates)
  return Number.isFinite(converted) ? converted : 0
}

function fromReportingAmount(
  amountInReporting: number,
  targetCurrency: string,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): number | null {
  const target = normalizeCurrency(targetCurrency)
  if (target === reportingCurrency) return amountInReporting
  const { converted: oneUnitInReporting } = convertWithRateMap(
    1,
    target,
    reportingCurrency,
    rateMap,
    fallbackRates,
  )
  if (!Number.isFinite(oneUnitInReporting) || oneUnitInReporting <= 0) return null
  return amountInReporting / oneUnitInReporting
}

function convertAmountBetweenCurrencies(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): number | null {
  const from = normalizeCurrency(fromCurrency)
  const to = normalizeCurrency(toCurrency)
  if (from === to) return amount
  const inReporting = toReportingAmount(amount, from, reportingCurrency, rateMap, fallbackRates)
  if (inReporting <= 0) return null
  return fromReportingAmount(inReporting, to, reportingCurrency, rateMap, fallbackRates)
}

function computeMargin(
  paidAmount: number,
  paidCurrency: string,
  providerCost: number,
  providerCurrency: string | null,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): number {
  const costCurrency = normalizeCurrency(providerCurrency ?? paidCurrency)
  const costInPaidCurrency =
    costCurrency === normalizeCurrency(paidCurrency)
      ? providerCost
      : convertAmountBetweenCurrencies(
          providerCost,
          costCurrency,
          paidCurrency,
          reportingCurrency,
          rateMap,
          fallbackRates,
        )
  if (costInPaidCurrency == null || !Number.isFinite(costInPaidCurrency)) return 0
  return Math.max(0, paidAmount - costInPaidCurrency)
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
      `recharge_orders?select=id,status,product_name,operator_name,sku_code,plan_id,created_at,transaction_id,transactions(amount,currency,status,metadata)&order=created_at.asc&limit=${pageSize}&offset=${offset}`,
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

async function fetchRoutingCosts(transactionIds: string[]): Promise<Map<string, { cost: number; currency: string | null }>> {
  const map = new Map<string, { cost: number; currency: string | null }>()
  if (transactionIds.length === 0) return map

  const chunkSize = 80
  for (let i = 0; i < transactionIds.length; i += chunkSize) {
    const chunk = transactionIds.slice(i, i + chunkSize)
    const res = await supabaseRest(
      `routing_logs?transaction_id=in.(${chunk.map(encodeURIComponent).join(',')})&select=transaction_id,provider_cost,status,created_at&order=created_at.desc`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const logs = (await res.json()) as Array<{
      transaction_id: string
      provider_cost: number | string | null
      status: string
      created_at: string
    }>

    for (const log of logs) {
      if (!log.transaction_id || map.has(log.transaction_id)) continue
      const cost = log.provider_cost != null ? Number(log.provider_cost) : NaN
      if (!Number.isFinite(cost) || cost <= 0) continue
      map.set(log.transaction_id, { cost, currency: null })
    }
  }

  return map
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

  const missingCostTxIds = rechargeRows
    .filter((row) => {
      const txn = unwrapTransaction(row)
      if (!txn || row.status !== 'completed') return false
      const metaCost = extractProviderCost(txn.metadata)
      return metaCost.cost == null && row.transaction_id
    })
    .map((row) => row.transaction_id!)
    .filter(Boolean)

  const routingCosts = await fetchRoutingCosts(missingCostTxIds)

  let completedOrders = 0
  let failedOrders = 0
  let pendingOrders = 0
  let totalMarginReporting = 0
  const marginByCurrency: Record<string, number> = {}
  const dailyMap = new Map<string, DashboardDailySale>()
  const productMap = new Map<string, DashboardTopProduct>()

  for (const row of rechargeRows) {
    const status = (row.status ?? '').toLowerCase()
    if (status === 'completed') completedOrders += 1
    else if (status === 'failed') failedOrders += 1
    else pendingOrders += 1

    const txn = unwrapTransaction(row)
    const paidAmount = txn ? numberFrom(txn.amount) : 0
    const paidCurrency = normalizeCurrency(txn?.currency)

    let providerCost: number | null = null
    let providerCurrency: string | null = null

    if (txn?.metadata) {
      const fromMeta = extractProviderCost(txn.metadata)
      providerCost = fromMeta.cost
      providerCurrency = fromMeta.currency
    }

    if ((providerCost == null || providerCost <= 0) && row.transaction_id) {
      const fromLog = routingCosts.get(row.transaction_id)
      if (fromLog) {
        providerCost = fromLog.cost
        providerCurrency = fromLog.currency
      }
    }

    if (providerCost != null && providerCurrency == null) {
      providerCurrency = paidCurrency
    }

    const marginNative =
      status === 'completed' && paidAmount > 0 && providerCost != null
        ? computeMargin(
            paidAmount,
            paidCurrency,
            providerCost,
            providerCurrency,
            reportingCurrency,
            rateMap,
            fallbackRates,
          )
        : 0

    if (marginNative > 0) {
      marginByCurrency[paidCurrency] = (marginByCurrency[paidCurrency] ?? 0) + marginNative
      totalMarginReporting += toReportingAmount(
        marginNative,
        paidCurrency,
        reportingCurrency,
        rateMap,
        fallbackRates,
      )
    }

    const day = dayKey(row.created_at)
    const dailyKey = `${day}:${paidCurrency}`
    const dailyExisting =
      dailyMap.get(dailyKey) ??
      ({
        day,
        currency: paidCurrency,
        revenue: 0,
        margin: 0,
        orders: 0,
        completed_orders: 0,
      } satisfies DashboardDailySale)

    dailyExisting.orders += 1
    if (status === 'completed') {
      dailyExisting.completed_orders += 1
      dailyExisting.revenue += paidAmount
      dailyExisting.margin += marginNative
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
        currency: paidCurrency,
      } satisfies DashboardTopProduct)

    if (status === 'completed') {
      productExisting.orders += 1
      productExisting.revenue += toReportingAmount(
        paidAmount,
        paidCurrency,
        reportingCurrency,
        rateMap,
        fallbackRates,
      )
      productExisting.margin += toReportingAmount(
        marginNative,
        paidCurrency,
        reportingCurrency,
        rateMap,
        fallbackRates,
      )
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

  const summary: DashboardSummary = {
    total_revenue: totalMarginReporting,
    total_margin: totalMarginReporting,
    total_orders: rechargeRows.length,
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
