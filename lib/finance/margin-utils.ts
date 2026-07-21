import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  convertWithRateMap,
  getFallbackExchangeRates,
  LCR_BASE_CURRENCY,
  loadCatalogExchangeRates,
} from '@/lib/routing/exchange-rates'

export function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? LCR_BASE_CURRENCY).trim().toUpperCase() || LCR_BASE_CURRENCY
}

export function extractProviderCost(meta: Record<string, unknown> | null | undefined): {
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
      ) as
        | {
            provider_wholesale_amount?: number
            provider_wholesale_currency?: string
            price?: number
            currency?: string
          }
        | undefined
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

export function computeMargin(
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

export function amountToReporting(
  amount: number,
  currency: string,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): number {
  return toReportingAmount(amount, currency, reportingCurrency, rateMap, fallbackRates)
}

export function marginToReporting(
  marginNative: number,
  paidCurrency: string,
  reportingCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): number {
  return toReportingAmount(marginNative, paidCurrency, reportingCurrency, rateMap, fallbackRates)
}

/** Fixed payment-gateway fee rate used for ITU Profit (matches Financial Report). */
export const ITU_PAYMENT_GATEWAY_FEE_RATE = 0.02

/** Payment gateway fee on completed non-wallet gross (reporting currency). */
export function computePaymentGatewayFee(
  grossReporting: number,
  isWalletPayment: boolean,
): number {
  if (isWalletPayment || !(grossReporting > 0)) return 0
  return parseFloat((grossReporting * ITU_PAYMENT_GATEWAY_FEE_RATE).toFixed(2))
}

/**
 * ITU Profit = Gross − Refunds − Payment Gateway − Provider Cost (reporting currency).
 * `computeItuRevenue` kept as alias name for existing call sites.
 */
export function computeItuRevenue(input: {
  grossReporting: number
  refundsReporting: number
  providerCostReporting: number
  gatewayFeesReporting?: number
}): number {
  return parseFloat(
    (
      input.grossReporting -
      input.refundsReporting -
      (input.gatewayFeesReporting ?? 0) -
      input.providerCostReporting
    ).toFixed(2),
  )
}

/** @see computeItuRevenue */
export const computeItuProfit = computeItuRevenue

export async function loadMarginRateContext(): Promise<{
  reportingCurrency: string
  rateMap: Map<string, number>
  fallbackRates: Record<string, number>
}> {
  const reportingCurrency = LCR_BASE_CURRENCY
  const [rateMap, fallbackRates] = await Promise.all([
    loadCatalogExchangeRates(reportingCurrency),
    Promise.resolve(getFallbackExchangeRates()),
  ])
  return { reportingCurrency, rateMap, fallbackRates }
}

export async function fetchRoutingCosts(
  transactionIds: string[],
): Promise<Map<string, { cost: number; currency: string | null; providerCode: string | null }>> {
  const map = new Map<string, { cost: number; currency: string | null; providerCode: string | null }>()
  if (transactionIds.length === 0) return map

  const chunkSize = 80
  for (let i = 0; i < transactionIds.length; i += chunkSize) {
    const chunk = transactionIds.slice(i, i + chunkSize)
    const res = await supabaseRest(
      `routing_logs?transaction_id=in.(${chunk.map(encodeURIComponent).join(',')})&select=transaction_id,provider_cost,status,created_at,lcr_providers(code)&order=created_at.asc`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue

    const logs = (await res.json()) as Array<{
      transaction_id: string
      provider_cost: number | string | null
      status: string
      created_at: string
      lcr_providers: { code: string } | null
    }>

    const groups: Record<string, typeof logs> = {}
    for (const log of logs) {
      if (!log.transaction_id) continue
      if (!groups[log.transaction_id]) groups[log.transaction_id] = []
      groups[log.transaction_id].push(log)
    }

    for (const [txId, txLogs] of Object.entries(groups)) {
      const sorted = [...txLogs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      let resolvedCost: number | null = null
      let resolvedCode = sorted[sorted.length - 1]?.lcr_providers?.code ?? null

      for (const log of sorted) {
        const cost = log.provider_cost != null ? Number(log.provider_cost) : NaN
        const code = log.lcr_providers?.code ?? null
        if (Number.isFinite(cost) && cost > 0) {
          resolvedCost = cost
          if (code) resolvedCode = code
        } else if (code && !resolvedCode) {
          resolvedCode = code
        }
      }

      if (resolvedCost != null || resolvedCode) {
        map.set(txId, {
          cost: resolvedCost ?? 0,
          currency: null,
          providerCode: resolvedCode,
        })
      }
    }
  }

  return map
}
