/** Explicit monetary fields — do not overload a single `amount` / `price`. */

export type ProviderWholesaleCost = {
  provider_wholesale_amount: number
  provider_wholesale_currency: string
}

export type DestinationFaceValue = {
  destination_face_value: number
  destination_currency: string
}

export type CustomerPayment = {
  customer_payment_amount: number
  customer_payment_currency: string
}

export type NormalizedProviderCost = {
  provider_wholesale_amount: number
  provider_wholesale_currency: string
  normalized_provider_price: number
  normalized_provider_currency: string
  exchange_rate_used: number | null
  exchange_rate_source: 'agg_exchange_rates' | 'fallback_config' | 'identity'
}
