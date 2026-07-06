import { extractPlanIdFromSources } from '@/lib/admin/plan-name-resolver'

export type RechargeCheckoutSummary = {
  planId: string
  planName: string
  planPrice: number
  planPriceCurrency: string
  serviceFee: number
  tax: number
  totalPayable: number
  paymentCurrency: string
  paymentMethod: string
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
  const mergedMeta = { ...orderMeta, ...metadata }

  const planId =
    extractPlanIdFromSources({
      planId: input.rechargeOrder?.plan_id,
      skuCode: input.rechargeOrder?.sku_code,
      productName: input.rechargeOrder?.product_name,
      metadata: mergedMeta,
    }) || '—'

  const serviceFee =
    input.rechargeOrder?.service_fee != null
      ? numberFrom(input.rechargeOrder.service_fee)
      : numberFrom(mergedMeta.service_fee ?? mergedMeta.serviceFee ?? mergedMeta.platform_fee)

  const tax =
    input.rechargeOrder?.tax != null
      ? numberFrom(input.rechargeOrder.tax)
      : numberFrom(mergedMeta.tax)

  const sendAmount = numberFrom(input.rechargeOrder?.send_amount)
  const receiveAmount = numberFrom(input.rechargeOrder?.receive_amount)

  const planPriceCurrency = normalizeCurrency(
    (typeof mergedMeta.recharge_currency === 'string' && mergedMeta.recharge_currency) ||
      input.rechargeOrder?.receive_currency ||
      input.rechargeOrder?.send_currency ||
      input.currency,
  )

  const paymentCurrency = normalizeCurrency(input.currency)

  let planPrice = numberFrom(
    mergedMeta.plan_price ??
      mergedMeta.planPrice ??
      mergedMeta.recharge_amount ??
      mergedMeta.amount,
  )

  if (planPrice <= 0 && receiveAmount > 0) {
    planPrice = receiveAmount
  }

  if (planPrice <= 0 && sendAmount > 0) {
    planPrice = Math.max(0, sendAmount - serviceFee - tax)
  }

  let totalPayable = numberFrom(mergedMeta.total_payable ?? mergedMeta.totalPayable ?? mergedMeta.total)
  if (totalPayable <= 0 && sendAmount > 0) {
    totalPayable = sendAmount
  }
  if (totalPayable <= 0 && input.amount > 0) {
    totalPayable = input.amount
  }

  return {
    planId,
    planName: input.planName,
    planPrice,
    planPriceCurrency,
    serviceFee,
    tax,
    totalPayable,
    paymentCurrency,
    paymentMethod: resolvePaymentMethod(mergedMeta),
  }
}
