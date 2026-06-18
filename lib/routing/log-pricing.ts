export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  fallback = '—',
): string {
  if (amount == null || !Number.isFinite(amount)) return fallback
  const code = String(currency ?? '').trim().toUpperCase()
  return code ? `${amount.toFixed(2)} ${code}` : amount.toFixed(2)
}

export function parseRoutingLogStatus(status: string): Record<string, unknown> {
  try {
    if (status && status.startsWith('{')) {
      return JSON.parse(status) as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return { event: status }
}

type EvaluatedProvider = {
  providerId?: string
  providerName?: string
  costPrice?: number | null
  price?: number | null
  currency?: string | null
  eligibility?: boolean
}

export function providerCurrencyFromRoutingDecision(
  routingDecision: unknown,
  providerId?: string | null,
  providerName?: string | null,
): string | null {
  if (!routingDecision || typeof routingDecision !== 'object') return null
  const rd = routingDecision as {
    evaluated_providers?: EvaluatedProvider[]
    selected_provider?: string | null
  }
  const list = Array.isArray(rd.evaluated_providers) ? rd.evaluated_providers : []

  const match = list.find(
    (row) =>
      (providerId && row.providerId === providerId) ||
      (providerName && row.providerName === providerName) ||
      (providerName && rd.selected_provider && row.providerName === rd.selected_provider) ||
      (providerId && rd.selected_provider && row.providerId === rd.selected_provider),
  )
  if (match?.currency) return String(match.currency).toUpperCase()

  const selected = list.find(
    (row) =>
      row.eligibility !== false &&
      (row.providerId === providerId ||
        row.providerName === providerName ||
        row.providerName === rd.selected_provider),
  )
  return selected?.currency ? String(selected.currency).toUpperCase() : null
}

export type RoutingLogPricing = {
  userAmount: number | null
  userCurrency: string | null
  providerCost: number | null
  providerCurrency: string | null
}

export function mergeRoutingLogPricing(
  base: {
    providerCost?: number | null
    providerId?: string | null
    providerName?: string | null
    status?: string
  },
  extras?: Partial<RoutingLogPricing> & { routingDecision?: unknown },
): RoutingLogPricing {
  const meta = parseRoutingLogStatus(base.status ?? '')

  const providerCurrency =
    extras?.providerCurrency ??
    (typeof meta.providerCurrency === 'string' ? meta.providerCurrency : null) ??
    providerCurrencyFromRoutingDecision(
      extras?.routingDecision,
      base.providerId,
      base.providerName,
    )

  const resolvedProviderCost =
    extras?.providerCost ??
    base.providerCost ??
    (typeof meta.providerCost === 'number' ? meta.providerCost : null) ??
    providerCostFromRoutingDecision(extras?.routingDecision, base.providerId, base.providerName)

  return {
    userAmount:
      extras?.userAmount ??
      (typeof meta.userAmount === 'number' ? meta.userAmount : null),
    userCurrency:
      extras?.userCurrency ??
      (typeof meta.userCurrency === 'string' ? meta.userCurrency : null),
    providerCost: resolvedProviderCost ?? null,
    providerCurrency: providerCurrency ? providerCurrency.toUpperCase() : null,
  }
}

export function providerCostFromRoutingDecision(
  routingDecision: unknown,
  providerId?: string | null,
  providerName?: string | null,
): number | null {
  if (!routingDecision || typeof routingDecision !== 'object') return null
  const rd = routingDecision as {
    evaluated_providers?: EvaluatedProvider[]
    selected_provider?: string | null
  }
  const list = Array.isArray(rd.evaluated_providers) ? rd.evaluated_providers : []
  const match = list.find(
    (row) =>
      (providerId && row.providerId === providerId) ||
      (providerName && row.providerName === providerName) ||
      (providerName && rd.selected_provider && row.providerName === rd.selected_provider),
  )
  const cost = match?.costPrice ?? match?.price
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : null
}
