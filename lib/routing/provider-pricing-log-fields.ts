import type { RoutingProviderCandidate } from '@/lib/routing/types'

export type ProviderPricingLogFields = {
  provider_wholesale_amount: number | null
  provider_wholesale_currency: string | null
  destination_face_value: number | null
  destination_currency: string | null
  normalized_provider_price: number | null
  selected_provider?: string | null
}

function finitePositive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export function pricingFieldsFromCandidate(
  candidate: Pick<
    RoutingProviderCandidate,
    | 'providerId'
    | 'provider_wholesale_amount'
    | 'provider_wholesale_currency'
    | 'destination_face_value'
    | 'destination_currency'
    | 'normalized_provider_price'
    | 'price'
    | 'currency'
  > | null | undefined,
): ProviderPricingLogFields {
  if (!candidate) {
    return {
      provider_wholesale_amount: null,
      provider_wholesale_currency: null,
      destination_face_value: null,
      destination_currency: null,
      normalized_provider_price: null,
      selected_provider: null,
    }
  }

  const wholesaleAmount =
    finitePositive(candidate.provider_wholesale_amount) ??
    (candidate.price != null && Number.isFinite(candidate.price) && candidate.price > 0 && candidate.price !== Infinity
      ? candidate.price
      : null)

  const wholesaleCurrency =
    (candidate.provider_wholesale_currency ?? candidate.currency ?? '').trim().toUpperCase() || null

  return {
    provider_wholesale_amount: wholesaleAmount,
    provider_wholesale_currency: wholesaleCurrency,
    destination_face_value: finitePositive(candidate.destination_face_value),
    destination_currency: (candidate.destination_currency ?? '').trim().toUpperCase() || null,
    normalized_provider_price: finitePositive(candidate.normalized_provider_price),
    selected_provider: candidate.providerId ?? null,
  }
}

/** Legacy provider_cost column = wholesale amount for backward compatibility. */
export function legacyProviderCostFromFields(fields: ProviderPricingLogFields): number | undefined {
  return fields.provider_wholesale_amount ?? undefined
}

export function detailedRoutingLogPricingInput(
  fields: ProviderPricingLogFields,
  extra?: { providerPlanId?: string | null },
) {
  return {
    providerCost: legacyProviderCostFromFields(fields),
    providerCurrency: fields.provider_wholesale_currency,
    providerWholesaleAmount: fields.provider_wholesale_amount,
    providerWholesaleCurrency: fields.provider_wholesale_currency,
    destinationFaceValue: fields.destination_face_value,
    destinationCurrency: fields.destination_currency,
    normalizedProviderPrice: fields.normalized_provider_price,
    providerPlanId: extra?.providerPlanId ?? undefined,
    selectedProvider: fields.selected_provider ?? undefined,
  }
}
