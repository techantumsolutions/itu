/**
 * Shared checkout kernel: link payment orders to pre-payment sessions.
 * Neutral package — imported by payments and topup (no reverse deps).
 */

import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type CheckoutPricingSnapshot = {
  platformFee?: number
  paymentGatewayFee?: number
  tax?: number
  planPrice?: number
  planPriceCurrency?: string
  totalInRechargeCurrency?: number
  fxRate?: number | null
  fxFromCurrency?: string
  fxToCurrency?: string
}

/** Update final customer charge on the linked recharge order (summary-page totals). */
export async function persistRechargeOrderPaymentTotals(input: {
  transactionId: string
  totalPayable: number
  paymentCurrency: string
  checkoutPricing?: CheckoutPricingSnapshot
}) {
  const currency = input.paymentCurrency.trim().toUpperCase()
  const pricing = input.checkoutPricing ?? {}
  const orderRes = await supabaseRest(
    `recharge_orders?transaction_id=eq.${enc(input.transactionId)}&select=id,metadata,send_currency,plan_price_currency&limit=1`,
    { cache: 'no-store' },
  )
  if (!orderRes.ok) return
  const rows = (await orderRes.json()) as Array<{
    id: string
    metadata?: Record<string, unknown>
    send_currency?: string | null
    plan_price_currency?: string | null
  }>
  const order = rows[0]
  if (!order?.id) return

  const fromCurrency = (
    pricing.fxFromCurrency ||
    pricing.planPriceCurrency ||
    order.plan_price_currency ||
    order.send_currency ||
    currency
  )
    .toString()
    .trim()
    .toUpperCase()
  const toCurrency = (pricing.fxToCurrency || currency).toString().trim().toUpperCase()
  const fxRate =
    pricing.fxRate != null && Number.isFinite(pricing.fxRate)
      ? pricing.fxRate
      : fromCurrency === toCurrency
        ? 1
        : null

  const platformFee =
    pricing.platformFee != null && Number.isFinite(pricing.platformFee) ? pricing.platformFee : undefined
  const paymentGatewayFee =
    pricing.paymentGatewayFee != null && Number.isFinite(pricing.paymentGatewayFee)
      ? pricing.paymentGatewayFee
      : undefined
  const serviceFee =
    platformFee != null || paymentGatewayFee != null
      ? (platformFee ?? 0) + (paymentGatewayFee ?? 0)
      : undefined

  const nextMeta: Record<string, unknown> = {
    ...(order.metadata ?? {}),
    total_payable: input.totalPayable,
    payment_currency: currency,
    user_pay_amount: input.totalPayable,
  }
  if (platformFee != null) nextMeta.platform_fee = platformFee
  if (paymentGatewayFee != null) nextMeta.payment_gateway_fee = paymentGatewayFee
  if (serviceFee != null) {
    nextMeta.service_fee = serviceFee
    nextMeta.service_fee_currency = fromCurrency
  }
  if (pricing.tax != null) nextMeta.tax = pricing.tax
  if (pricing.planPrice != null) nextMeta.plan_price = pricing.planPrice
  if (pricing.planPriceCurrency) nextMeta.plan_price_currency = pricing.planPriceCurrency
  if (pricing.totalInRechargeCurrency != null) {
    nextMeta.total_in_recharge_currency = pricing.totalInRechargeCurrency
  }
  if (fxRate != null) {
    nextMeta.fx_rate = fxRate
    nextMeta.fx_from_currency = fromCurrency
    nextMeta.fx_to_currency = toCurrency
    nextMeta.checkout_fx_rate = fxRate
  }

  const columnPatch: Record<string, unknown> = {
    total_payable: input.totalPayable,
    payment_currency: currency,
    metadata: nextMeta,
  }
  if (platformFee != null) columnPatch.platform_fee = platformFee
  if (paymentGatewayFee != null) columnPatch.payment_gateway_fee = paymentGatewayFee
  if (serviceFee != null) columnPatch.service_fee = serviceFee
  if (pricing.tax != null) columnPatch.tax = pricing.tax
  if (pricing.planPrice != null) columnPatch.plan_price = pricing.planPrice
  if (pricing.planPriceCurrency) columnPatch.plan_price_currency = pricing.planPriceCurrency
  if (fxRate != null) {
    columnPatch.fx_rate = fxRate
    columnPatch.fx_from_currency = fromCurrency
    columnPatch.fx_to_currency = toCurrency
  }

  const withColumns = await supabaseRest(`recharge_orders?id=eq.${enc(order.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(columnPatch),
  })

  if (!withColumns.ok) {
    await supabaseRest(`recharge_orders?id=eq.${enc(order.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ metadata: nextMeta }),
    })
  }
}

/** Link a payment order row to a pre-payment checkout session. */
export async function linkPaymentOrderToCheckoutSession(input: {
  paymentOrderId: string
  checkoutSessionId: string
  transactionId: string
  rechargeAttemptId?: string
  selectedProviderId?: string
  selectedProviderName?: string
  selectedProviderPlanId?: string
  selectedProviderCost?: number | null
  selectedProviderCurrency?: string | null
  routingResult?: unknown
  lcrResult?: unknown
  providerSelectionTimestamp?: string
  totalPayable?: number
  paymentCurrency?: string
  checkoutPricing?: CheckoutPricingSnapshot
}) {
  await supabaseRest(`payment_orders?id=eq.${enc(input.paymentOrderId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'pending_payment',
      checkout_session_id: input.checkoutSessionId,
      pending_transaction_id: input.transactionId,
      lcr_attempt_id: input.rechargeAttemptId ?? null,
      selected_provider_id: input.selectedProviderId ?? null,
      selected_provider_name: input.selectedProviderName ?? null,
      selected_provider_plan_id: input.selectedProviderPlanId ?? null,
      selected_provider_cost: input.selectedProviderCost ?? null,
      selected_provider_currency: input.selectedProviderCurrency ?? null,
      routing_result: input.routingResult ?? null,
      lcr_result: input.lcrResult ?? null,
      provider_selection_timestamp: input.providerSelectionTimestamp ?? new Date().toISOString(),
    }),
  })

  if (
    input.transactionId &&
    input.totalPayable != null &&
    Number.isFinite(input.totalPayable) &&
    input.paymentCurrency
  ) {
    await persistRechargeOrderPaymentTotals({
      transactionId: input.transactionId,
      totalPayable: input.totalPayable,
      paymentCurrency: input.paymentCurrency,
      checkoutPricing: input.checkoutPricing,
    })
  }
}
