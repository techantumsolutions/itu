/**
 * Server-only wallet checkout authority.
 * Loads identity + pricing from the pending transaction; never trusts client money fields.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  resolveCheckoutPriceAuthority,
  type CheckoutPriceAuthority,
} from '@/lib/payments/checkout-price-authority'
import {
  convertUsingEurBaseRates,
  normalizeCurrencyCode,
  type EurBaseRates,
} from '@/lib/checkout/currency-conversion'
import { razorpayCurrencyExponent } from '@/lib/payments/razorpay-amount'
import { claimCheckoutTransactionOwnership } from '@/lib/checkout/attach-checkout-user'

export type WalletCheckoutContext = {
  transactionId: string
  planId: string
  systemPlanId?: string
  mobileNumber: string
  operatorId: string
  countryId: string
  payCurrency: string
  walletCurrency: string
  authority: CheckoutPriceAuthority
  txnMeta: Record<string, unknown>
}

export type WalletCheckoutResolveResult =
  | { ok: true; ctx: WalletCheckoutContext }
  | { ok: false; error: string; status: number }

function roundToCurrency(amount: number, currency: string): number {
  const factor = 10 ** razorpayCurrencyExponent(currency)
  return Math.round(amount * factor) / factor
}

async function readAppSettingNumber(key: string, fallback: number): Promise<number> {
  const res = await supabaseRest(
    `app_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return fallback
  const rows = (await res.json().catch(() => [])) as Array<{ value?: unknown }>
  const raw = rows?.[0]?.value
  const n = Number(raw)
  return raw != null && Number.isFinite(n) ? n : fallback
}

async function fetchEurBaseRates(): Promise<EurBaseRates | null> {
  const res = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' }).catch(
    () => null,
  )
  if (!res?.ok) return null
  const data = await res.json().catch(() => null)
  return data?.rates ? (data.rates as EurBaseRates) : null
}

/** Max redeemable points for payable (server-side; no client point quantity). */
async function computeMaxRewardPoints(input: {
  userId: string
  payableInPayCurrency: number
  payCurrency: string
  rates: EurBaseRates | null
}): Promise<number> {
  const balRes = await supabaseRest(
    `reward_accounts?user_id=eq.${encodeURIComponent(input.userId)}&select=points_balance&limit=1`,
    { cache: 'no-store' },
  )
  const balRows = balRes.ok
    ? ((await balRes.json().catch(() => [])) as Array<{ points_balance?: number }>)
    : []
  const pointsBalance = Number(balRows[0]?.points_balance) || 0
  if (pointsBalance <= 0) return 0

  const minBalanceToRedeem = await readAppSettingNumber('reward_min_balance_to_redeem', 0)
  if (pointsBalance < minBalanceToRedeem) return 0

  const maxRedemptionPct = await readAppSettingNumber('reward_max_redemption_percentage', 50)
  const pointEurValue = await readAppSettingNumber('reward_point_eur_value', 0.01)
  const maxByPct = Math.floor(pointsBalance * (maxRedemptionPct / 100))
  if (maxByPct <= 0) return 0

  let onePointInPay = pointEurValue
  const payCurrency = normalizeCurrencyCode(input.payCurrency) || 'EUR'
  if (payCurrency !== 'EUR') {
    if (!input.rates) return 0
    const converted = convertUsingEurBaseRates(pointEurValue, 'EUR', payCurrency, input.rates)
    if (converted == null || converted <= 0) return 0
    onePointInPay = converted
  }

  const maxByPayable = Math.floor(input.payableInPayCurrency / onePointInPay)
  return Math.max(0, Math.min(maxByPct, maxByPayable, pointsBalance))
}

async function pickWalletCurrency(userId: string, preferredCurrency: string): Promise<string | null> {
  const preferred = normalizeCurrencyCode(preferredCurrency) || preferredCurrency
  const exact = await supabaseRest(
    `wallets?user_id=eq.${encodeURIComponent(userId)}&currency=eq.${encodeURIComponent(
      preferred,
    )}&select=currency,balance&limit=1`,
    { cache: 'no-store' },
  )
  if (exact.ok) {
    const rows = (await exact.json().catch(() => [])) as Array<{ currency?: string; balance?: number }>
    if (rows[0]?.currency) return String(rows[0].currency).toUpperCase()
  }

  const any = await supabaseRest(
    `wallets?user_id=eq.${encodeURIComponent(userId)}&balance=gt.0&select=currency,balance&order=balance.desc&limit=1`,
    { cache: 'no-store' },
  )
  if (any.ok) {
    const rows = (await any.json().catch(() => [])) as Array<{ currency?: string }>
    if (rows[0]?.currency) return String(rows[0].currency).toUpperCase()
  }

  return null
}

/**
 * Resolve a full wallet-only checkout from transactionId alone.
 * Applies maximum eligible rewards, then covers the remainder with wallet.
 */
export async function resolveServerWalletCheckout(input: {
  userId: string
  transactionId: string
}): Promise<WalletCheckoutResolveResult> {
  const transactionId = input.transactionId.trim()
  if (!transactionId) {
    return { ok: false, error: 'transactionId is required', status: 400 }
  }

  const txnRes = await supabaseRest(
    `transactions?id=eq.${encodeURIComponent(
      transactionId,
    )}&select=id,user_id,amount,currency,status,type,metadata&limit=1`,
    { cache: 'no-store' },
  )
  if (!txnRes.ok) {
    return { ok: false, error: 'Unable to load transaction', status: 400 }
  }
  const txnRows = (await txnRes.json().catch(() => [])) as Array<{
    id?: string
    user_id?: string | null
    amount?: number
    currency?: string
    status?: string
    type?: string
    metadata?: Record<string, unknown>
  }>
  const txn = txnRows[0]
  if (!txn?.id) {
    return { ok: false, error: 'Transaction not found', status: 404 }
  }

  const status = String(txn.status ?? '').toLowerCase()
  if (status !== 'pending_payment') {
    return { ok: false, error: 'Transaction is not awaiting payment', status: 400 }
  }

  // Ownership: never process another user's txn. Null owner → atomic bind (guest prepare).
  const ownership = await claimCheckoutTransactionOwnership({
    userId: input.userId,
    transactionId,
  })
  if (!ownership.ok) {
    return { ok: false, error: ownership.error, status: ownership.status }
  }

  const meta = (txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}) as Record<
    string,
    unknown
  >
  const planId =
    (typeof meta.plan_id === 'string' && meta.plan_id.trim()) ||
    (typeof meta.system_plan_id === 'string' && meta.system_plan_id.trim()) ||
    ''
  const systemPlanId =
    typeof meta.system_plan_id === 'string' && meta.system_plan_id.trim()
      ? meta.system_plan_id.trim()
      : undefined
  const mobileNumber =
    typeof meta.mobile_number === 'string' ? meta.mobile_number.trim() : ''
  const operatorId = typeof meta.operator_id === 'string' ? meta.operator_id.trim() : ''
  const countryId = typeof meta.country_id === 'string' ? meta.country_id.trim() : ''

  if (!planId || !mobileNumber || !operatorId || !countryId) {
    return {
      ok: false,
      error: 'Pending transaction is missing plan / mobile / operator / country',
      status: 422,
    }
  }

  const payCurrency = normalizeCurrencyCode(txn.currency) || 'INR'
  const walletCurrency = await pickWalletCurrency(input.userId, payCurrency)
  if (!walletCurrency) {
    return { ok: false, error: 'No wallet found for this account', status: 400 }
  }

  const rechargeTotal = Number(txn.amount)
  if (!Number.isFinite(rechargeTotal) || rechargeTotal <= 0) {
    return { ok: false, error: 'Invalid pending checkout amount', status: 400 }
  }

  const needRates = payCurrency !== 'EUR'
  const rates = needRates ? await fetchEurBaseRates() : null

  const payableInPay = roundToCurrency(rechargeTotal, payCurrency)

  const maxRewardPoints = await computeMaxRewardPoints({
    userId: input.userId,
    payableInPayCurrency: payableInPay,
    payCurrency,
    rates,
  })

  const baseAuthority = await resolveCheckoutPriceAuthority({
    userId: input.userId,
    checkoutSessionId: transactionId,
    payCurrency,
    requestedWalletAmount: 0,
    walletCurrency,
    requestedRewardPoints: maxRewardPoints,
  })
  if (!baseAuthority.validationResult.ok) {
    const v = baseAuthority.validationResult
    return { ok: false, error: v.error, status: v.status }
  }

  const walletNeeded = Math.max(0, baseAuthority.payableAmount - baseAuthority.rewardCredit)
  const authority = await resolveCheckoutPriceAuthority({
    userId: input.userId,
    checkoutSessionId: transactionId,
    payCurrency,
    requestedWalletAmount: walletNeeded,
    walletCurrency,
    requestedRewardPoints: maxRewardPoints,
  })
  if (!authority.validationResult.ok) {
    const v = authority.validationResult
    return { ok: false, error: v.error, status: v.status }
  }

  if (authority.razorpayCharge > 0.0001) {
    return {
      ok: false,
      error: 'Insufficient wallet balance for full wallet checkout',
      status: 400,
    }
  }

  return {
    ok: true,
    ctx: {
      transactionId,
      planId,
      systemPlanId,
      mobileNumber,
      operatorId,
      countryId,
      payCurrency,
      walletCurrency,
      authority,
      txnMeta: meta,
    },
  }
}

export function checkoutPricingFromTxnMeta(meta: Record<string, unknown>) {
  return {
    platformFee: typeof meta.platform_fee === 'number' ? meta.platform_fee : undefined,
    paymentGatewayFee:
      typeof meta.payment_gateway_fee === 'number' ? meta.payment_gateway_fee : undefined,
    tax: typeof meta.tax === 'number' ? meta.tax : undefined,
    planPrice: typeof meta.plan_price === 'number' ? meta.plan_price : undefined,
    planPriceCurrency:
      typeof meta.plan_price_currency === 'string'
        ? meta.plan_price_currency
        : typeof meta.recharge_currency === 'string'
          ? meta.recharge_currency
          : undefined,
    totalInRechargeCurrency:
      typeof meta.total_payable === 'number' ? meta.total_payable : undefined,
    fxRate: typeof meta.fx_rate === 'number' ? meta.fx_rate : null,
    fxFromCurrency:
      typeof meta.fx_from_currency === 'string' ? meta.fx_from_currency : undefined,
    fxToCurrency: typeof meta.fx_to_currency === 'string' ? meta.fx_to_currency : undefined,
  }
}
