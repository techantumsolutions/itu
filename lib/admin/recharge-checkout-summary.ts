import { extractPlanIdFromSources } from '@/lib/admin/plan-name-resolver'

export type RechargeCheckoutSummary = {
  planId: string
  planName: string
  planPrice: number
  planPriceCurrency: string
  /** Combined platform + gateway (legacy display). */
  serviceFee: number
  serviceFeeCurrency: string
  platformFee: number
  paymentGatewayFee: number
  tax: number
  taxCurrency: string
  totalPayable: number
  paymentCurrency: string
  paymentMethod: string
  providerCost: number | null
  providerCostCurrency: string | null
  routingType: string | null
  /** FX rate locked at recharge time: 1 fxFromCurrency = fxRate fxToCurrency */
  fxRate: number | null
  fxFromCurrency: string | null
  fxToCurrency: string | null
  totalInRechargeCurrency: number | null
}

function numberFrom(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeCurrency(currency: string | null | undefined, fallback = 'INR'): string {
  const c = (currency ?? fallback).trim().toUpperCase()
  return c || fallback
}

function resolvePaymentMethod(metadata: Record<string, unknown>): string {
  const gateway = typeof metadata.payment_gateway === 'string' ? metadata.payment_gateway.trim() : ''
  if (gateway) {
    return gateway.charAt(0).toUpperCase() + gateway.slice(1).toLowerCase()
  }
  if (metadata.razorpay_payment_id) return 'Razorpay'
  if (metadata.payment_order_id) return 'Razorpay'
  const usedWallet = numberFrom(metadata.used_wallet_balance)
  if (usedWallet > 0) return 'Wallet'
  return '—'
}

type RechargeOrderLike = {
  plan_id?: string | null
  sku_code?: string | null
  product_name?: string | null
  send_amount?: number | string | null
  send_currency?: string | null
  receive_amount?: number | string | null
  receive_currency?: string | null
  service_fee?: number | string | null
  tax?: number | string | null
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
  metadata?: Record<string, unknown> | null
}

export function buildRechargeCheckoutSummary(input: {
  type: string
  amount: number
  currency: string
  metadata: Record<string, unknown>
  planName: string
  rechargeOrder?: RechargeOrderLike | null
}): RechargeCheckoutSummary | null {
  if (input.type !== 'recharge') return null

  const metadata = input.metadata ?? {}
  const orderMeta = input.rechargeOrder?.metadata ?? {}
  // Prefer order metadata for checkout pricing (rates/fees at recharge time).
  const mergedMeta = { ...metadata, ...orderMeta }

  const planId =
    extractPlanIdFromSources({
      planId: input.rechargeOrder?.plan_id,
      skuCode: input.rechargeOrder?.sku_code,
      productName: input.rechargeOrder?.product_name,
      metadata: mergedMeta,
    }) || '—'

  const sendAmount = numberFrom(input.rechargeOrder?.send_amount)
  const sendCurrency = normalizeCurrency(
    input.rechargeOrder?.send_currency ||
      (typeof mergedMeta.recharge_currency === 'string' ? mergedMeta.recharge_currency : null) ||
      input.currency,
  )

  const planPriceCurrency = normalizeCurrency(
    input.rechargeOrder?.plan_price_currency ||
      (typeof mergedMeta.plan_price_currency === 'string' ? mergedMeta.plan_price_currency : null) ||
      (typeof mergedMeta.recharge_currency === 'string' ? mergedMeta.recharge_currency : null) ||
      sendCurrency,
  )

  const platformFee = numberFrom(
    input.rechargeOrder?.platform_fee ?? mergedMeta.platform_fee ?? mergedMeta.platformFee,
  )
  const paymentGatewayFee = numberFrom(
    input.rechargeOrder?.payment_gateway_fee ??
      mergedMeta.payment_gateway_fee ??
      mergedMeta.paymentGatewayFee,
  )

  let serviceFee =
    input.rechargeOrder?.service_fee != null
      ? numberFrom(input.rechargeOrder.service_fee)
      : numberFrom(mergedMeta.service_fee ?? mergedMeta.serviceFee)

  if (platformFee + paymentGatewayFee > 0) {
    serviceFee = platformFee + paymentGatewayFee
  }

  const tax =
    input.rechargeOrder?.tax != null
      ? numberFrom(input.rechargeOrder.tax)
      : numberFrom(mergedMeta.tax)

  const serviceFeeCurrency = normalizeCurrency(
    input.rechargeOrder?.service_fee_currency ||
      (typeof mergedMeta.service_fee_currency === 'string' ? mergedMeta.service_fee_currency : null) ||
      planPriceCurrency,
  )

  const taxCurrency = normalizeCurrency(
    input.rechargeOrder?.tax_currency ||
      (typeof mergedMeta.tax_currency === 'string' ? mergedMeta.tax_currency : null) ||
      planPriceCurrency,
  )

  // Prefer dedicated plan_price column / metadata. Never use receive_amount (provider cost).
  // Never recalculate with live FX — use values frozen at recharge time.
  let planPrice = numberFrom(
    input.rechargeOrder?.plan_price ??
      mergedMeta.plan_price ??
      mergedMeta.planPrice ??
      mergedMeta.recharge_amount,
  )

  if (planPrice > 0 && sendAmount > 0 && Math.abs(planPrice - sendAmount) < 0.0001 && (serviceFee > 0 || tax > 0)) {
    planPrice = Math.max(0, sendAmount - serviceFee - tax)
  }

  if (planPrice <= 0 && sendAmount > 0) {
    planPrice = Math.max(0, sendAmount - serviceFee - tax)
  }

  const paymentCurrency = normalizeCurrency(
    input.rechargeOrder?.payment_currency ||
      (typeof mergedMeta.payment_currency === 'string' ? mergedMeta.payment_currency : null) ||
      input.currency ||
      sendCurrency,
  )

  let totalPayable = numberFrom(
    input.rechargeOrder?.total_payable ??
      mergedMeta.total_payable ??
      mergedMeta.totalPayable ??
      mergedMeta.user_pay_amount ??
      mergedMeta.total,
  )
  if (totalPayable <= 0 && sendAmount > 0) {
    totalPayable = sendAmount
  }
  if (totalPayable <= 0 && input.amount > 0) {
    totalPayable = input.amount
  }

  const totalInRechargeCurrencyRaw = numberFrom(
    mergedMeta.total_in_recharge_currency ?? mergedMeta.totalInRechargeCurrency,
  )
  const totalInRechargeCurrency =
    totalInRechargeCurrencyRaw > 0
      ? totalInRechargeCurrencyRaw
      : planPrice + serviceFee + tax > 0
        ? planPrice + serviceFee + tax
        : sendAmount > 0
          ? sendAmount
          : null

  const providerCostRaw =
    input.rechargeOrder?.provider_cost != null
      ? numberFrom(input.rechargeOrder.provider_cost)
      : numberFrom(mergedMeta.provider_cost ?? mergedMeta.selected_provider_cost)
  const providerCost = providerCostRaw > 0 ? providerCostRaw : null
  const providerCostCurrency =
    providerCost != null
      ? normalizeCurrency(
          input.rechargeOrder?.provider_cost_currency ||
            (typeof mergedMeta.provider_cost_currency === 'string'
              ? mergedMeta.provider_cost_currency
              : null) ||
            (typeof mergedMeta.selected_provider_currency === 'string'
              ? mergedMeta.selected_provider_currency
              : null) ||
            input.rechargeOrder?.receive_currency,
          planPriceCurrency,
        )
      : null

  const routingType =
    (typeof input.rechargeOrder?.routing_type === 'string' && input.rechargeOrder.routing_type.trim()) ||
    (typeof mergedMeta.routing_type === 'string' && mergedMeta.routing_type.trim()) ||
    null

  const fxRateRaw = numberFrom(
    input.rechargeOrder?.fx_rate ?? mergedMeta.fx_rate ?? mergedMeta.checkout_fx_rate,
  )
  const fxFromCurrency = normalizeCurrency(
    input.rechargeOrder?.fx_from_currency ||
      (typeof mergedMeta.fx_from_currency === 'string' ? mergedMeta.fx_from_currency : null) ||
      planPriceCurrency,
    planPriceCurrency,
  )
  const fxToCurrency = normalizeCurrency(
    input.rechargeOrder?.fx_to_currency ||
      (typeof mergedMeta.fx_to_currency === 'string' ? mergedMeta.fx_to_currency : null) ||
      paymentCurrency,
    paymentCurrency,
  )
  const fxRate =
    fxRateRaw > 0
      ? fxRateRaw
      : fxFromCurrency === fxToCurrency
        ? 1
        : null

  return {
    planId,
    planName: input.planName,
    planPrice,
    planPriceCurrency,
    serviceFee,
    serviceFeeCurrency,
    platformFee,
    paymentGatewayFee,
    tax,
    taxCurrency,
    totalPayable,
    paymentCurrency,
    paymentMethod: resolvePaymentMethod(mergedMeta),
    providerCost,
    providerCostCurrency,
    routingType,
    fxRate,
    fxFromCurrency,
    fxToCurrency,
    totalInRechargeCurrency,
  }
}
