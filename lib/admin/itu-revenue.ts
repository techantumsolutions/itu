/**
 * Canonical ITU Revenue calculation — same source & rules as Admin Dashboard.
 *
 * Source: recharge_orders + embedded transactions(amount,currency,status,metadata)
 * Gross:   transactions.amount when recharge_orders.status === 'completed'
 * Refunds: recharge/txn status in refunded|cancelled
 * Cost:    transactions.metadata (selected_provider_cost / LCR / routing) → routing_logs fallback
 * ITU Revenue = Gross − Refunds − Provider Cost (EUR)
 */

import {
  amountToReporting,
  computeItuRevenue,
  computeMargin,
  extractProviderCost,
  fetchRoutingCosts,
  loadMarginRateContext,
  marginToReporting,
  normalizeCurrency,
} from '@/lib/admin/margin-utils'

export type ItuTxnEmbed = {
  amount: number | string | null
  currency: string | null
  status: string | null
  metadata: Record<string, unknown> | null
}

export type ItuRechargeRow = {
  id?: string
  status: string | null
  payment_status?: string | null
  created_at?: string
  transaction_id?: string | null
  send_amount?: number | string | null
  send_currency?: string | null
  receive_amount?: number | string | null
  receive_currency?: string | null
  transactions?: ItuTxnEmbed | ItuTxnEmbed[] | null
}

export type ItuAmountBreakdown = {
  paidAmount: number
  paidCurrency: string
  isCompleted: boolean
  isRefunded: boolean
  providerCost: number | null
  providerCurrency: string | null
  grossReporting: number
  costReporting: number
  refundReporting: number
  marginNative: number
  marginReporting: number
  ituContribution: number
}

function numberFrom(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function unwrapTransaction(row: {
  transactions?: ItuTxnEmbed | ItuTxnEmbed[] | null
}): ItuTxnEmbed | null {
  if (!row.transactions) return null
  return Array.isArray(row.transactions) ? row.transactions[0] ?? null : row.transactions
}

export function resolveProviderCostForRow(
  row: ItuRechargeRow,
  routingCosts?: Map<string, { cost: number; currency: string | null }>,
): { cost: number | null; currency: string | null } {
  const txn = unwrapTransaction(row)
  const paidCurrency = normalizeCurrency(txn?.currency ?? row.send_currency)

  let providerCost: number | null = null
  let providerCurrency: string | null = null

  if (txn?.metadata) {
    const fromMeta = extractProviderCost(txn.metadata)
    providerCost = fromMeta.cost
    providerCurrency = fromMeta.currency
  }

  // Fallback: recharge_orders.receive_amount (same as post-payment write)
  if ((providerCost == null || providerCost <= 0) && numberFrom(row.receive_amount) > 0) {
    providerCost = numberFrom(row.receive_amount)
    providerCurrency = row.receive_currency || paidCurrency
  }

  if ((providerCost == null || providerCost <= 0) && row.transaction_id && routingCosts) {
    const fromLog = routingCosts.get(row.transaction_id)
    if (fromLog && fromLog.cost > 0) {
      providerCost = fromLog.cost
      providerCurrency = fromLog.currency
    }
  }

  if (providerCost != null && providerCurrency == null) {
    providerCurrency = paidCurrency
  }

  return { cost: providerCost, currency: providerCurrency }
}

/** Resolve ITU amounts for one recharge row using Dashboard rules. */
export function resolveItuAmountsForRow(
  row: ItuRechargeRow,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
  routingCosts?: Map<string, { cost: number; currency: string | null }>,
): ItuAmountBreakdown {
  const txn = unwrapTransaction(row)
  const status = (row.status ?? '').toLowerCase()
  const txnStatus = (txn?.status ?? '').toLowerCase()
  const paymentStatus = (row.payment_status ?? '').toLowerCase()

  const isCompleted = status === 'completed'
  const isRefunded =
    status === 'refunded' ||
    status === 'cancelled' ||
    txnStatus === 'refunded' ||
    txnStatus === 'cancelled' ||
    paymentStatus === 'refunded' ||
    paymentStatus === 'cancelled'

  // Dashboard gross source: transactions.amount (fallback to send_amount)
  const paidAmount = txn ? numberFrom(txn.amount) : numberFrom(row.send_amount)
  const paidCurrency = normalizeCurrency(txn?.currency ?? row.send_currency)

  const { cost: providerCost, currency: providerCurrency } = resolveProviderCostForRow(row, routingCosts)

  let grossReporting = 0
  let costReporting = 0
  let refundReporting = 0
  let marginNative = 0
  let marginReporting = 0

  if (isRefunded && paidAmount > 0) {
    refundReporting = amountToReporting(
      paidAmount,
      paidCurrency,
      reportingCurrency,
      rateMap,
      fallbackRates,
    )
  }

  if (isCompleted && paidAmount > 0) {
    grossReporting = amountToReporting(
      paidAmount,
      paidCurrency,
      reportingCurrency,
      rateMap,
      fallbackRates,
    )
    if (providerCost != null && providerCost > 0) {
      costReporting = amountToReporting(
        providerCost,
        normalizeCurrency(providerCurrency ?? paidCurrency),
        reportingCurrency,
        rateMap,
        fallbackRates,
      )
      marginNative = computeMargin(
        paidAmount,
        paidCurrency,
        providerCost,
        providerCurrency,
        reportingCurrency,
        rateMap,
        fallbackRates,
      )
      marginReporting = marginToReporting(
        marginNative,
        paidCurrency,
        reportingCurrency,
        rateMap,
        fallbackRates,
      )
    }
  }

  return {
    paidAmount,
    paidCurrency,
    isCompleted,
    isRefunded,
    providerCost,
    providerCurrency,
    grossReporting,
    costReporting,
    refundReporting,
    marginNative,
    marginReporting,
    ituContribution: computeItuRevenue({
      grossReporting,
      refundsReporting: refundReporting,
      providerCostReporting: costReporting,
    }),
  }
}

/** Load routing_logs costs for completed rows missing metadata cost (Dashboard behavior). */
export async function loadRoutingCostsForItuRows(
  rows: ItuRechargeRow[],
): Promise<Map<string, { cost: number; currency: string | null; providerCode: string | null }>> {
  const missingIds = rows
    .filter((row) => {
      if ((row.status ?? '').toLowerCase() !== 'completed') return false
      if (!row.transaction_id) return false
      const txn = unwrapTransaction(row)
      if (!txn) return true
      const metaCost = extractProviderCost(txn.metadata)
      return metaCost.cost == null || metaCost.cost <= 0
    })
    .map((row) => row.transaction_id!)
    .filter(Boolean)

  return fetchRoutingCosts(missingIds)
}

export async function loadItuRateContext() {
  return loadMarginRateContext()
}

export { computeItuRevenue }
