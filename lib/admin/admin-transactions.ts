import { resolveCustomerDisplay } from '@/lib/auth/customer-display'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { resolveTransactionDisplayStatus } from '@/lib/transactions/display-status'
import {
  computeMargin,
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
  resolveRoutingTypeLabel,
} from '@/lib/transactions/routing-type'
import { resolveAdminTransactionDateRange } from '@/lib/admin/admin-transaction-date-range'
import { matchesAdminTransactionSearch } from '@/lib/admin/admin-transaction-search'

const RO_SELECT =
  'id,user_id,transaction_id,lcr_attempt_id,country_iso,operator_code,operator_name,plan_id,sku_code,product_name,phone_number,send_amount,send_currency,receive_amount,receive_currency,status,payment_status,provider,provider_ref,failure_reason,metadata,created_at,updated_at,service_fee,tax,profiles(name,email,phone,country_code,country)'

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
  profiles: {
    name: string | null
    email: string | null
    phone: string | null
    country_code: string | null
    country: string | null
  } | null
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

function buildDbFilters(query: AdminTransactionsQuery): string {
  const parts = ['status=neq.pending_payment']
  const range = resolveAdminTransactionDateRange(query.date)
  if (range.start) {
    parts.push(`created_at=gte.${encodeURIComponent(range.start.toISOString())}`)
  }
  if (range.end) {
    parts.push(`created_at=lte.${encodeURIComponent(range.end.toISOString())}`)
  }
  return parts.join('&')
}

async function fetchAllMatchingRows(filters: string): Promise<RechargeOrderRow[]> {
  const pageSize = 500
  const rows: RechargeOrderRow[] = []
  let offset = 0

  while (true) {
    const res = await supabaseRest(
      `recharge_orders?${filters}&select=${RO_SELECT}&order=created_at.desc&limit=${pageSize}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const batch = (await res.json()) as RechargeOrderRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return rows
}

function mapBaseRechargeOrder(row: RechargeOrderRow) {
  const customer = resolveCustomerDisplay({
    profile: row.profiles,
    metadata: row.metadata ?? {},
    rechargePhone: row.phone_number || undefined,
  })

  // Display status resolves from payment status and recharge order status
  const displayStatus = resolveTransactionDisplayStatus({
    type: 'recharge',
    transactionStatus: row.payment_status || 'completed',
    rechargeOrderStatus: row.status || 'completed',
  })

  return {
    id: row.transaction_id || row.id, // transaction ID is used for client actions / refunds
    userId: row.user_id ?? '',
    type: 'recharge',
    amount: numberFrom(row.send_amount),
    currency: row.send_currency || 'USD',
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

function resolveMarginForRow(
  row: RechargeOrderRow,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): { marginNative: number; marginReporting: number } {
  const paidAmount = numberFrom(row.send_amount)
  const paidCurrency = normalizeCurrency(row.send_currency || 'USD')

  // Only calculate margin on successful top-ups
  if (row.status !== 'completed' || paidAmount <= 0) {
    return { marginNative: 0, marginReporting: 0 }
  }

  const providerCost = numberFrom(row.receive_amount)
  let providerCurrency = row.receive_currency || paidCurrency

  if (providerCost <= 0) {
    return { marginNative: 0, marginReporting: 0 }
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

  const planIds = allRows.map((row) => {
    return extractPlanIdFromSources({
      planId: row.plan_id || undefined,
      skuCode: row.sku_code || undefined,
      productName: row.product_name || undefined,
      metadata: row.metadata,
    })
  })

  const planNameMap = await resolvePlanNameMap(planIds)

  const enriched = allRows.map((row) => {
    const base = mapBaseRechargeOrder(row)
    const planId = extractPlanIdFromSources({
      planId: row.plan_id || undefined,
      skuCode: row.sku_code || undefined,
      productName: row.product_name || undefined,
      metadata: row.metadata,
    })

    const metaProductName =
      typeof base.metadata?.productName === 'string' ? base.metadata.productName : null
    const planName = resolveProductDisplayName(
      row.product_name ?? metaProductName,
      planId,
      planNameMap,
    )

    const { marginReporting } = resolveMarginForRow(
      row,
      reportingCurrency,
      rateMap,
      fallbackRates,
    )

    let routingType = resolveRoutingTypeLabel(base.metadata)

    return {
      ...base,
      planName,
      routingType,
      rechargeSummary: buildRechargeCheckoutSummary({
        type: 'recharge',
        amount: base.amount,
        currency: base.currency,
        metadata: base.metadata,
        planName,
        rechargeOrder: {
          product_name: row.product_name,
          sku_code: row.sku_code,
          plan_id: row.plan_id,
          provider: row.provider,
          operator_name: row.operator_name,
          status: row.status,
          phone_number: row.phone_number,
          service_fee: row.service_fee,
          tax: row.tax,
          send_amount: row.send_amount,
          send_currency: row.send_currency,
          receive_amount: row.receive_amount,
          receive_currency: row.receive_currency,
          metadata: row.metadata,
        },
      }),
      margin: marginReporting,
      marginCurrency: reportingCurrency,
    }
  })

  const displayStatusFilter = (query.status ?? '').trim()
  const searchQuery = (query.search ?? '').trim()
  const filtered = enriched.filter((row) => {
    if (row.status === 'pending_payment' || row.displayStatus === 'pending_payment') return false
    if (displayStatusFilter && displayStatusFilter !== 'all') {
      if (row.displayStatus !== displayStatusFilter) return false
    }
    if (searchQuery && !matchesAdminTransactionSearch(row, searchQuery)) return false
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
