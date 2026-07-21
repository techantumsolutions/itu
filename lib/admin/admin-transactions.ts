import { resolveCustomerDisplay } from '@/lib/auth/customer-display'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { parseContentRangeTotal } from '@/lib/db/postgrest-paginate'
import { resolveTransactionDisplayStatus } from '@/lib/transactions/display-status'
import {
  computeItuRevenue,
  loadRoutingCostsForItuRows,
  resolveItuAmountsForRow,
  unwrapTransaction,
} from '@/lib/admin/itu-revenue'
import {
  loadMarginRateContext,
  normalizeCurrency,
} from '@/lib/admin/margin-utils'
import {
  extractPlanIdFromSources,
  isSyntheticPlanProductName,
  resolvePlanNameMap,
  resolveProductDisplayName,
} from '@/lib/admin/plan-name-resolver'
import {
  buildRechargeCheckoutSummary,
  type RechargeCheckoutSummary,
} from '@/lib/admin/recharge-checkout-summary'
import {
  resolveRoutingTypeLabel,
  formatRoutingType,
} from '@/lib/transactions/routing-type'
import { resolveAdminTransactionDateRange } from '@/lib/admin/admin-transaction-date-range'
import { matchesAdminTransactionSearch } from '@/lib/admin/admin-transaction-search'

const RO_SELECT_BASE =
  'id,user_id,transaction_id,lcr_attempt_id,country_iso,operator_code,operator_name,plan_id,sku_code,product_name,phone_number,send_amount,send_currency,receive_amount,receive_currency,status,payment_status,provider,provider_ref,failure_reason,metadata,created_at,updated_at,service_fee,tax,profiles(name,email,phone,country_code,country),transactions(amount,currency,status,metadata)'

const RO_SELECT_PRICING =
  'plan_price,plan_price_currency,service_fee_currency,tax_currency,total_payable,payment_currency,provider_cost,provider_cost_currency,routing_type,platform_fee,payment_gateway_fee,fx_rate,fx_from_currency,fx_to_currency'

const RO_SELECT = `${RO_SELECT_BASE.replace(',profiles(', `,${RO_SELECT_PRICING},profiles(`)}`

/** Lightweight select for summary aggregation (no profiles join). */
const RO_SELECT_SUMMARY =
  `id,transaction_id,status,payment_status,send_amount,send_currency,receive_amount,receive_currency,provider_cost,provider_cost_currency,payment_gateway_fee,metadata,created_at,transactions(amount,currency,status,metadata)`

const SUMMARY_PAGE = 500
const SUMMARY_MAX_ROWS = 10_000

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RechargeOrderRow = {
  id: string
  user_id: string | null
  transaction_id: string | null
  lcr_attempt_id: string | null
  country_iso: string | null
  operator_code: string | null
  operator_name: string | null
  plan_id: string | null
  sku_code: string | null
  product_name: string | null
  phone_number: string | null
  send_amount: number | string | null
  send_currency: string | null
  receive_amount: number | string | null
  receive_currency: string | null
  status: string | null
  payment_status: string | null
  provider: string | null
  provider_ref: string | null
  failure_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  service_fee: number | string | null
  tax: number | string | null
  plan_price?: number | string | null
  plan_price_currency?: string | null
  service_fee_currency?: string | null
  tax_currency?: string | null
  total_payable?: number | string | null
  payment_currency?: string | null
  provider_cost?: number | string | null
  provider_cost_currency?: string | null
  routing_type?: string | null
  platform_fee?: number | string | null
  payment_gateway_fee?: number | string | null
  fx_rate?: number | string | null
  fx_from_currency?: string | null
  fx_to_currency?: string | null
  profiles: {
    name: string | null
    email: string | null
    phone: string | null
    country_code: string | null
    country: string | null
  } | null
  transactions?: {
    amount: number | string | null
    currency: string | null
    status: string | null
    metadata: Record<string, unknown> | null
  } | Array<{
    amount: number | string | null
    currency: string | null
    status: string | null
    metadata: Record<string, unknown> | null
  }> | null
}

export type AdminTransactionRecord = {
  id: string
  userId: string
  type: string
  amount: number
  currency: string
  status: string
  displayStatus: string
  description: string
  metadata: Record<string, unknown>
  createdAt: string
  margin: number
  marginCurrency: string
  planName: string
  routingType: string
  rechargeSummary: RechargeCheckoutSummary | null
  user: {
    name: string
    email: string
    phone?: string
    country?: string
  }
  rechargeDetails: {
    productName: string
    skuCode: string
    provider: string
    operatorName: string
    status: string
    phoneNumber?: string
  } | null
}

export type AdminTransactionsSummary = {
  total_orders: number
  completed_orders: number
  failed_orders: number
  pending_orders: number
  /** @deprecated use itu_revenue — kept for UI compatibility */
  total_margin: number
  gross_revenue: number
  refunds: number
  payment_gateway_fees: number
  provider_cost: number
  /** ITU Profit = Gross − Refunds − Payment Gateway − Provider Cost */
  itu_revenue: number
  reporting_currency: string
}

export type AdminTransactionsResult = {
  transactions: AdminTransactionRecord[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  summary: AdminTransactionsSummary
}

export type AdminTransactionsQuery = {
  page?: number
  pageSize?: number
  status?: string
  date?: string
  search?: string
}

function numberFrom(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Map UI display status filter → PostgREST recharge_orders.status filter. */
function statusFilterParts(status?: string): string[] {
  const s = (status ?? '').trim().toLowerCase()
  if (!s || s === 'all') return []
  if (s === 'completed') return ['status=in.(completed,success)']
  if (s === 'failed') return ['status=in.(failed,provider_unavailable_after_payment)']
  if (s === 'processing') return ['status=eq.processing']
  if (s === 'pending') return ['status=eq.pending']
  if (s === 'cancelled' || s === 'refunded') return [`status=eq.${s}`]
  if (s === 'pending_payment') return ['payment_status=eq.pending_payment']
  return [`status=eq.${encodeURIComponent(s)}`]
}

function searchFilterParts(search?: string): string[] {
  const q = (search ?? '').trim()
  if (!q) return []
  const term = encodeURIComponent(q)
  const parts = [
    `phone_number.ilike.*${term}*`,
    `provider.ilike.*${term}*`,
    `operator_name.ilike.*${term}*`,
    `product_name.ilike.*${term}*`,
    `sku_code.ilike.*${term}*`,
    `provider_ref.ilike.*${term}*`,
  ]
  if (UUID_RE.test(q)) {
    parts.push(`id.eq.${term}`)
    parts.push(`transaction_id.eq.${term}`)
    parts.push(`user_id.eq.${term}`)
  }
  return [`or=(${parts.join(',')})`]
}

function buildDbFilters(query: AdminTransactionsQuery): string {
  const parts = ['status=neq.pending_payment']
  const range = resolveAdminTransactionDateRange(query.date)
  if (range.start) {
    parts.push(`created_at=gte.${encodeURIComponent(range.start.toISOString())}`)
  }
  if (range.end) {
    parts.push(`created_at=lte.${encodeURIComponent(range.end.toISOString())}`)
  }
  parts.push(...statusFilterParts(query.status))
  parts.push(...searchFilterParts(query.search))
  return parts.join('&')
}

async function fetchPage(
  filters: string,
  page: number,
  pageSize: number,
): Promise<{ rows: RechargeOrderRow[]; total: number; select: string }> {
  const offset = (page - 1) * pageSize
  let select = RO_SELECT
  let triedFallback = false

  for (;;) {
    const res = await supabaseRest(
      `recharge_orders?${filters}&select=${select}&order=created_at.desc&limit=${pageSize}&offset=${offset}`,
      {
        cache: 'no-store',
        headers: { Prefer: 'count=exact' } as Record<string, string>,
      },
    )
    if (!res.ok) {
      if (!triedFallback && select === RO_SELECT) {
        triedFallback = true
        select = RO_SELECT_BASE
        continue
      }
      return { rows: [], total: 0, select }
    }
    const rows = (await res.json()) as RechargeOrderRow[]
    const total = parseContentRangeTotal(res) ?? rows.length
    return { rows, total, select }
  }
}

/**
 * Bounded lightweight scan for summary cards — never loads unbounded sets into memory.
 */
async function fetchSummaryRows(filters: string): Promise<RechargeOrderRow[]> {
  const rows: RechargeOrderRow[] = []
  let offset = 0
  let select = RO_SELECT_SUMMARY
  let triedFallback = false

  while (rows.length < SUMMARY_MAX_ROWS) {
    const limit = Math.min(SUMMARY_PAGE, SUMMARY_MAX_ROWS - rows.length)
    const res = await supabaseRest(
      `recharge_orders?${filters}&select=${select}&order=created_at.desc&limit=${limit}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      if (!triedFallback) {
        triedFallback = true
        select =
          'id,transaction_id,status,payment_status,send_amount,send_currency,receive_amount,receive_currency,metadata,created_at,transactions(amount,currency,status,metadata)'
        offset = 0
        rows.length = 0
        continue
      }
      break
    }
    const batch = (await res.json()) as RechargeOrderRow[]
    rows.push(...batch)
    if (batch.length < limit) break
    offset += batch.length
  }
  return rows
}

function mapBaseRechargeOrder(row: RechargeOrderRow) {
  const customer = resolveCustomerDisplay({
    profile: row.profiles,
    metadata: row.metadata ?? {},
    rechargePhone: row.phone_number || undefined,
  })

  const displayStatus = resolveTransactionDisplayStatus({
    type: 'recharge',
    transactionStatus: row.payment_status || 'completed',
    rechargeOrderStatus: row.status || 'completed',
  })

  const txn = unwrapTransaction(row)
  const amount = txn ? numberFrom(txn.amount) : numberFrom(row.send_amount)
  const currency = normalizeCurrency(txn?.currency ?? row.send_currency)

  return {
    id: row.transaction_id || row.id,
    userId: row.user_id ?? '',
    type: 'recharge',
    amount,
    currency,
    status: row.payment_status || 'completed',
    displayStatus,
    description: `Recharge ${row.phone_number || '—'}`,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    user: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      country: customer.country,
    },
    rechargeDetails: {
      productName: row.product_name ?? '—',
      skuCode: row.sku_code ?? '—',
      provider: row.provider ?? '—',
      operatorName: row.operator_name ?? '—',
      status: row.status ?? '—',
      phoneNumber: row.phone_number ?? '—',
    },
  }
}

function enrichPageRows(
  pageRows: RechargeOrderRow[],
  reportingCurrency: string,
  rateMap: Awaited<ReturnType<typeof loadMarginRateContext>>['rateMap'],
  fallbackRates: Awaited<ReturnType<typeof loadMarginRateContext>>['fallbackRates'],
  routingCosts: Awaited<ReturnType<typeof loadRoutingCostsForItuRows>>,
  planNameMap: Map<string, string>,
): AdminTransactionRecord[] {
  return pageRows.map((row) => {
    const base = mapBaseRechargeOrder(row)
    const txn = unwrapTransaction(row)
    const txnMeta = (txn?.metadata ?? {}) as Record<string, unknown>
    const orderMeta = (row.metadata ?? {}) as Record<string, unknown>
    const mergedMeta = { ...orderMeta, ...txnMeta }

    const planId = extractPlanIdFromSources({
      planId: row.plan_id || undefined,
      skuCode: row.sku_code || undefined,
      productName: row.product_name || undefined,
      metadata: mergedMeta,
    })

    const metaPlanName =
      (typeof mergedMeta.plan_name === 'string' && mergedMeta.plan_name.trim()) ||
      (typeof mergedMeta.productName === 'string' && mergedMeta.productName.trim()) ||
      (typeof mergedMeta.product_name === 'string' && mergedMeta.product_name.trim()) ||
      null

    const planName = resolveProductDisplayName(
      metaPlanName && !isSyntheticPlanProductName(metaPlanName, planId)
        ? metaPlanName
        : row.product_name ?? metaPlanName,
      planId,
      planNameMap,
    )

    const itu = resolveItuAmountsForRow(
      row,
      reportingCurrency,
      rateMap,
      fallbackRates,
      routingCosts,
    )

    const routingTypeFromColumn =
      typeof row.routing_type === 'string' && row.routing_type.trim()
        ? formatRoutingType(row.routing_type)
        : null
    const routingType =
      routingTypeFromColumn && routingTypeFromColumn !== '—'
        ? routingTypeFromColumn
        : resolveRoutingTypeLabel(mergedMeta)

    const rechargeSummary = buildRechargeCheckoutSummary({
      type: 'recharge',
      amount: base.amount,
      currency: base.currency,
      metadata: mergedMeta,
      planName,
      rechargeOrder: {
        product_name: row.product_name,
        sku_code: row.sku_code,
        plan_id: row.plan_id,
        service_fee: row.service_fee,
        tax: row.tax,
        send_amount: row.send_amount,
        send_currency: row.send_currency,
        receive_amount: row.receive_amount,
        receive_currency: row.receive_currency,
        plan_price: row.plan_price,
        plan_price_currency: row.plan_price_currency,
        service_fee_currency: row.service_fee_currency,
        tax_currency: row.tax_currency,
        total_payable: row.total_payable,
        payment_currency: row.payment_currency,
        provider_cost: row.provider_cost,
        provider_cost_currency: row.provider_cost_currency,
        routing_type: row.routing_type,
        platform_fee: row.platform_fee,
        payment_gateway_fee: row.payment_gateway_fee,
        fx_rate: row.fx_rate,
        fx_from_currency: row.fx_from_currency,
        fx_to_currency: row.fx_to_currency,
        metadata: orderMeta,
      },
    })

    if (rechargeSummary && (rechargeSummary.providerCost == null || rechargeSummary.providerCost <= 0)) {
      if (itu.providerCost != null && itu.providerCost > 0) {
        rechargeSummary.providerCost = itu.providerCost
        rechargeSummary.providerCostCurrency = normalizeCurrency(
          itu.providerCurrency ?? row.receive_currency ?? row.send_currency,
        )
      }
    }

    return {
      ...base,
      metadata: mergedMeta,
      planName,
      routingType,
      rechargeSummary,
      rechargeDetails: {
        ...base.rechargeDetails!,
        productName: planName,
      },
      margin: itu.marginReporting,
      marginCurrency: reportingCurrency,
    }
  })
}

export async function loadAdminTransactions(query: AdminTransactionsQuery): Promise<AdminTransactionsResult> {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 10), 100)
  const filters = buildDbFilters(query)
  const searchQuery = (query.search ?? '').trim()

  const [{ reportingCurrency, rateMap, fallbackRates }, pageResult, summaryRows] = await Promise.all([
    loadMarginRateContext(),
    fetchPage(filters, page, pageSize),
    fetchSummaryRows(filters),
  ])

  let pageRows = pageResult.rows
  let total = pageResult.total

  // Client refine for search when PostgREST OR may miss enriched fields (email, etc.)
  if (searchQuery && pageRows.length > 0) {
    const routingCostsPreview = await loadRoutingCostsForItuRows(pageRows)
    const planIdsPreview = pageRows.flatMap((row) => {
      const ids: string[] = []
      const primary = extractPlanIdFromSources({
        planId: row.plan_id || undefined,
        skuCode: row.sku_code || undefined,
        productName: row.product_name || undefined,
        metadata: row.metadata,
      })
      if (primary) ids.push(primary)
      return ids
    })
    const planNameMapPreview = await resolvePlanNameMap(planIdsPreview)
    const enrichedPreview = enrichPageRows(
      pageRows,
      reportingCurrency,
      rateMap,
      fallbackRates,
      routingCostsPreview,
      planNameMapPreview,
    )
    const matched = enrichedPreview.filter((row) => matchesAdminTransactionSearch(row, searchQuery))
    // If server filter already constrained well, keep page; else filter in-page only
    if (matched.length < enrichedPreview.length) {
      pageRows = pageRows.filter((_, i) => matched.some((m) => m.id === (pageRows[i].transaction_id || pageRows[i].id)))
      // Prefer count from summary scan when searching
      total = summaryRows.length
    }
  }

  const routingCosts = await loadRoutingCostsForItuRows([...pageRows, ...summaryRows])

  const planIds = pageRows.flatMap((row) => {
    const ids: string[] = []
    const primary = extractPlanIdFromSources({
      planId: row.plan_id || undefined,
      skuCode: row.sku_code || undefined,
      productName: row.product_name || undefined,
      metadata: row.metadata,
    })
    if (primary) ids.push(primary)
    const meta = row.metadata ?? {}
    for (const key of ['system_plan_id', 'internal_plan_id', 'plan_id'] as const) {
      const v = meta[key]
      if (typeof v === 'string' && v.trim()) ids.push(v.trim())
    }
    const txn = unwrapTransaction(row)
    const txnMeta = txn?.metadata ?? {}
    for (const key of ['system_plan_id', 'internal_plan_id', 'plan_id'] as const) {
      const v = txnMeta[key]
      if (typeof v === 'string' && v.trim()) ids.push(v.trim())
    }
    return ids
  })

  const planNameMap = await resolvePlanNameMap(planIds)
  const transactions = enrichPageRows(
    pageRows,
    reportingCurrency,
    rateMap,
    fallbackRates,
    routingCosts,
    planNameMap,
  )

  let completedOrders = 0
  let failedOrders = 0
  let pendingOrders = 0
  let grossRevenue = 0
  let refundsTotal = 0
  let gatewayFeesTotal = 0
  let providerCostTotal = 0

  for (const row of summaryRows) {
    const displayStatus = resolveTransactionDisplayStatus({
      type: 'recharge',
      transactionStatus: row.payment_status || 'completed',
      rechargeOrderStatus: row.status || 'completed',
    })
    if (displayStatus === 'pending_payment') continue
    if (displayStatus === 'completed') completedOrders += 1
    else if (displayStatus === 'failed') failedOrders += 1
    else pendingOrders += 1

    const itu = resolveItuAmountsForRow(
      row,
      reportingCurrency,
      rateMap,
      fallbackRates,
      routingCosts,
    )
    grossRevenue += numberFrom(itu.grossReporting)
    refundsTotal += numberFrom(itu.refundReporting)
    gatewayFeesTotal += numberFrom(itu.gatewayFeeReporting)
    providerCostTotal += numberFrom(itu.costReporting)
  }

  const ituProfit = computeItuRevenue({
    grossReporting: grossRevenue,
    refundsReporting: refundsTotal,
    providerCostReporting: providerCostTotal,
    gatewayFeesReporting: gatewayFeesTotal,
  })

  const summaryTotal = completedOrders + failedOrders + pendingOrders
  const effectiveTotal = searchQuery ? Math.max(total, summaryTotal) : total || summaryTotal
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize))
  const safePage = Math.min(page, totalPages)

  return {
    transactions,
    pagination: {
      page: safePage,
      pageSize,
      total: effectiveTotal,
      totalPages,
    },
    summary: {
      total_orders: summaryTotal || effectiveTotal,
      completed_orders: completedOrders,
      failed_orders: failedOrders,
      pending_orders: pendingOrders,
      total_margin: ituProfit,
      gross_revenue: parseFloat(grossRevenue.toFixed(2)),
      refunds: parseFloat(refundsTotal.toFixed(2)),
      payment_gateway_fees: parseFloat(gatewayFeesTotal.toFixed(2)),
      provider_cost: parseFloat(providerCostTotal.toFixed(2)),
      itu_revenue: ituProfit,
      reporting_currency: reportingCurrency,
    },
  }
}
