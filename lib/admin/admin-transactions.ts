import { formatProfilePhone } from '@/lib/auth/build-auth-user'
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

const TX_SELECT =
  'id,user_id,type,amount,currency,status,description,metadata,created_at,profiles(name,email,phone,country_code,country),recharge_orders(product_name,sku_code,provider,operator_name,status,phone_number)'

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
    provider: string | null
    operator_name: string | null
    status: string | null
    phone_number: string | null
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
  const parts = ['type=neq.refund']
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
  const profilePhone = formatProfilePhone(row.profiles)
  const profileName = row.profiles?.name?.trim() || ''
  const profileEmail = row.profiles?.email?.trim() || ''
  const profileCountry = row.profiles?.country?.trim() || ''

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
      name: profileName || profilePhone || 'Unknown',
      email: profileEmail || '—',
      phone: profilePhone ?? '—',
      country: profileCountry || '—',
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

  const enriched = allRows.map((row) => {
    const base = mapBaseTransaction(row)
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

    return {
      ...base,
      rechargeDetails,
      margin: marginReporting,
      marginCurrency: reportingCurrency,
    }
  })

  const displayStatusFilter = (query.status ?? '').trim()
  const filtered =
    displayStatusFilter && displayStatusFilter !== 'all'
      ? enriched.filter((row) => row.displayStatus === displayStatusFilter)
      : enriched

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
