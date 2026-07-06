import { resolveCustomerDisplay } from '@/lib/auth/customer-display'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { resolveTransactionDisplayStatus } from '@/lib/transactions/display-status'
import {
  computeMargin,
  extractProviderCost,
  fetchRoutingCosts,
  loadMarginRateContext,
  marginToReporting,
  normalizeCurrency,
} from '@/lib/admin/margin-utils'
import {
  extractPlanIdFromSources,
  resolvePlanNameMap,
  resolveProductDisplayName,
} from '@/lib/admin/plan-name-resolver'
import {
  buildRechargeCheckoutSummary,
  type RechargeCheckoutSummary,
} from '@/lib/admin/recharge-checkout-summary'
import {
  fetchRoutingTypesFromLogs,
  formatRoutingType,
  resolveRoutingTypeLabel,
} from '@/lib/transactions/routing-type'

const TX_SELECT =
  'id,user_id,type,amount,currency,status,description,metadata,created_at,profiles(name,email,phone,country_code,country),recharge_orders(product_name,sku_code,plan_id,provider,operator_name,status,phone_number,service_fee,tax,send_amount,send_currency,receive_amount,receive_currency,metadata)'

type TransactionRow = {
  id: string
  user_id: string | null
  type: string
  amount: number | string
  currency: string
  status: string
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  profiles: {
    name: string | null
    email: string | null
    phone: string | null
    country_code: string | null
    country: string | null
  } | null
  recharge_orders: Array<{
    product_name: string | null
    sku_code: string | null
    plan_id: string | null
    provider: string | null
    operator_name: string | null
    status: string | null
    phone_number: string | null
    service_fee?: number | string | null
    tax?: number | string | null
    send_amount?: number | string | null
    send_currency?: string | null
    receive_amount?: number | string | null
    receive_currency?: string | null
    metadata?: Record<string, unknown> | null
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
  total_margin: number
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

function dateFilterIso(date: string): string | null {
  const now = new Date()
  if (date === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start.toISOString()
  }
  if (date === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - 7)
    return start.toISOString()
  }
  if (date === 'month') {
    const start = new Date(now)
    start.setMonth(now.getMonth() - 1)
    return start.toISOString()
  }
  return null
}

function buildDbFilters(query: AdminTransactionsQuery): string {
  const parts = ['type=neq.refund', 'status=neq.pending_payment']
  const since = dateFilterIso(query.date ?? 'all')
  if (since) {
    parts.push(`created_at=gte.${encodeURIComponent(since)}`)
  }
  const search = (query.search ?? '').trim()
  if (search) {
    const enc = encodeURIComponent(`*${search}*`)
    parts.push(
      `or=(id.ilike.${enc},description.ilike.${enc},profiles.name.ilike.${enc},profiles.email.ilike.${enc},profiles.phone.ilike.${enc})`,
    )
  }
  return parts.join('&')
}

async function fetchAllMatchingRows(filters: string): Promise<TransactionRow[]> {
  const pageSize = 500
  const rows: TransactionRow[] = []
  let offset = 0

  while (true) {
    const res = await supabaseRest(
      `transactions?${filters}&select=${TX_SELECT}&order=created_at.desc&limit=${pageSize}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const batch = (await res.json()) as TransactionRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return rows
}

function mapBaseTransaction(row: TransactionRow) {
  const rechargeOrder = row.recharge_orders?.[0] ?? null
  const customer = resolveCustomerDisplay({
    profile: row.profiles,
    metadata: row.metadata ?? {},
    rechargePhone: rechargeOrder?.phone_number,
  })

  const displayStatus = resolveTransactionDisplayStatus({
    type: row.type,
    transactionStatus: row.status,
    rechargeOrderStatus: rechargeOrder?.status,
  })

  return {
    id: row.id,
    userId: row.user_id ?? '',
    type: row.type,
    amount: numberFrom(row.amount),
    currency: row.currency,
    status: row.status,
    displayStatus,
    description: row.description ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    user: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      country: customer.country,
    },
    rechargeDetails: rechargeOrder
      ? {
          productName: rechargeOrder.product_name ?? '—',
          skuCode: rechargeOrder.sku_code ?? '—',
          provider: rechargeOrder.provider ?? '—',
          operatorName: rechargeOrder.operator_name ?? '—',
          status: rechargeOrder.status ?? '—',
          phoneNumber: rechargeOrder.phone_number ?? '—',
        }
      : null,
  }
}

function resolveMarginForRow(
  row: TransactionRow,
  routingData: Map<string, { cost: number; currency: string | null; providerCode: string | null }>,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): { marginNative: number; marginReporting: number } {
  const base = mapBaseTransaction(row)
  const paidAmount = base.amount
  const paidCurrency = normalizeCurrency(base.currency)

  if (base.displayStatus !== 'completed' || paidAmount <= 0) {
    return { marginNative: 0, marginReporting: 0 }
  }

  let providerCost: number | null = null
  let providerCurrency: string | null = null

  const fromMeta = extractProviderCost(base.metadata)
  providerCost = fromMeta.cost
  providerCurrency = fromMeta.currency

  const fromLog = routingData.get(row.id)
  if ((providerCost == null || providerCost <= 0) && fromLog && fromLog.cost > 0) {
    providerCost = fromLog.cost
    providerCurrency = fromLog.currency
  }

  if (providerCost == null || providerCost <= 0) {
    return { marginNative: 0, marginReporting: 0 }
  }

  if (providerCurrency == null) {
    providerCurrency = paidCurrency
  }

  const marginNative = computeMargin(
    paidAmount,
    paidCurrency,
    providerCost,
    providerCurrency,
    reportingCurrency,
    rateMap,
    fallbackRates,
  )
  const marginReporting = marginToReporting(
    marginNative,
    paidCurrency,
    reportingCurrency,
    rateMap,
    fallbackRates,
  )

  return { marginNative, marginReporting }
}

export async function loadAdminTransactions(query: AdminTransactionsQuery): Promise<AdminTransactionsResult> {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 10), 100)
  const filters = buildDbFilters(query)

  const [{ reportingCurrency, rateMap, fallbackRates }, allRows] = await Promise.all([
    loadMarginRateContext(),
    fetchAllMatchingRows(filters),
  ])

  const txIdsNeedingLogs = allRows
    .filter((row) => {
      const meta = row.metadata ?? {}
      const fromMeta = extractProviderCost(meta)
      return fromMeta.cost == null
    })
    .map((row) => row.id)

  const routingData = await fetchRoutingCosts(txIdsNeedingLogs)

  const routingTypes = await fetchRoutingTypesFromLogs(
    allRows.filter((row) => row.type === 'recharge').map((row) => row.id),
  )

  const planIds = allRows.map((row) => {
    const recharge = row.recharge_orders?.[0]
    return extractPlanIdFromSources({
      planId: recharge?.plan_id,
      skuCode: recharge?.sku_code,
      productName: recharge?.product_name,
      metadata: row.metadata,
    })
  })

  const planNameMap = await resolvePlanNameMap(planIds)

  const enriched = allRows.map((row) => {
    const base = mapBaseTransaction(row)
    const recharge = row.recharge_orders?.[0]
    const planId = extractPlanIdFromSources({
      planId: recharge?.plan_id,
      skuCode: recharge?.sku_code,
      productName: recharge?.product_name,
      metadata: row.metadata,
    })

    let planName = 'Recharge Plan'
    if (base.type === 'topup') planName = 'Wallet Top-up'
    else if (base.type === 'refund') planName = 'Wallet Refund'
    else if (base.type === 'commission') planName = 'Commission Credit'
    else {
      const metaProductName =
        typeof base.metadata?.productName === 'string' ? base.metadata.productName : null
      planName = resolveProductDisplayName(
        recharge?.product_name ?? metaProductName,
        planId,
        planNameMap,
      )
    }

    const { marginReporting } = resolveMarginForRow(
      row,
      routingData,
      reportingCurrency,
      rateMap,
      fallbackRates,
    )

    const logProvider = routingData.get(row.id)?.providerCode
    let rechargeDetails = base.rechargeDetails
    if (logProvider) {
      if (!rechargeDetails) {
        rechargeDetails = {
          productName: '—',
          skuCode: '—',
          provider: logProvider,
          operatorName: '—',
          status: '—',
          phoneNumber: '—',
        }
      } else if (
        !rechargeDetails.provider ||
        rechargeDetails.provider === '—' ||
        rechargeDetails.provider === 'null'
      ) {
        rechargeDetails = { ...rechargeDetails, provider: logProvider }
      }
    }

    let routingType = resolveRoutingTypeLabel(base.metadata)
    if (routingType === '—') {
      const fromLog = routingTypes.get(row.id)
      if (fromLog) routingType = formatRoutingType(fromLog)
    }

    return {
      ...base,
      rechargeDetails,
      planName,
      routingType,
      rechargeSummary: buildRechargeCheckoutSummary({
        type: base.type,
        amount: base.amount,
        currency: base.currency,
        metadata: base.metadata,
        planName,
        rechargeOrder: recharge ?? null,
      }),
      margin: marginReporting,
      marginCurrency: reportingCurrency,
    }
  })

  const displayStatusFilter = (query.status ?? '').trim()
  const filtered = enriched.filter((row) => {
    if (row.status === 'pending_payment' || row.displayStatus === 'pending_payment') return false
    if (displayStatusFilter && displayStatusFilter !== 'all') {
      return row.displayStatus === displayStatusFilter
    }
    return true
  })

  let completedOrders = 0
  let failedOrders = 0
  let pendingOrders = 0
  let totalMargin = 0

  for (const row of filtered) {
    const ds = row.displayStatus
    if (ds === 'completed') completedOrders += 1
    else if (ds === 'failed') failedOrders += 1
    else pendingOrders += 1

    if (ds === 'completed') {
      totalMargin += row.margin
    }
  }

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  return {
    transactions: pageRows,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    summary: {
      total_orders: total,
      completed_orders: completedOrders,
      failed_orders: failedOrders,
      pending_orders: pendingOrders,
      total_margin: totalMargin,
      reporting_currency: reportingCurrency,
    },
  }
}
