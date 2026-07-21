/**
 * C2 + C4: server-side payment authority for the Razorpay (hybrid) checkout path.
 *
 * The pending `transactions` row created during prepare-checkout is the single
 * source of truth for the payable total. This module recomputes the charge and
 * validates the wallet / reward credits against the user's real balances and the
 * admin `app_settings` limits.
 *
 * Layering:
 *  - `computeCheckoutPriceAuthority` is PURE: it only performs calculations and
 *    validations and returns a result. It never reads or writes anything.
 *  - `resolveCheckoutPriceAuthority` is a thin, READ-ONLY loader that gathers the
 *    server-side data (balances, settings, FX rates) and delegates to the pure
 *    function. All write side effects (Razorpay order, payment_orders, wallet
 *    debit, reward redemption) stay in the route / service layer.
 *
 * Design constraints (approved):
 *  - The pending transaction is authoritative. No second pricing calculation.
 *  - All exchange-rate data comes from server-side sources; client fxRate is never
 *    trusted. Same-currency reuses the stored amount with no FX at all.
 *  - Tolerance is for float / currency minor-unit rounding only — never a
 *    percentage-based payment deviation.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  convertUsingEurBaseRates,
  normalizeCurrencyCode,
  type EurBaseRates,
} from '@/lib/checkout/currency-conversion'
import { razorpayCurrencyExponent } from '@/lib/payments/razorpay-amount'

export type PriceValidation =
  | { ok: true }
  | { ok: false; error: string; code?: string; status: number }

export type CheckoutPriceAuthority = {
  /** Authoritative payable total in the pay currency (before wallet / rewards). */
  payableAmount: number
  /** Validated wallet credit in the pay currency. */
  walletCredit: number
  /** Validated reward credit in the pay currency. */
  rewardCredit: number
  /** Validated reward points to redeem. */
  rewardPoints: number
  /** Server-authoritative charge = payableAmount - walletCredit - rewardCredit. */
  razorpayCharge: number
  /** Normalized wallet currency the credit is drawn from. */
  walletCurrency: string
  validationResult: PriceValidation
}

/** Pre-resolved, side-effect-free inputs for the pure calculation. */
export type CheckoutPriceInputs = {
  userId: string | null
  /** Currency the user is paying in (payable currency). */
  payCurrency: string
  /** Currency of the authoritative pending transaction total. */
  rechargeCurrency: string
  /** Authoritative total from the pending transaction (recharge currency). */
  rechargeTotal: number
  /** Wallet credit the client claims, expressed in the payable currency. */
  requestedWalletAmount: number
  walletCurrency: string
  /** Real wallet balance in walletCurrency (null when absent / not loaded). */
  walletBalance: number | null
  maxConsumptionPct: number
  requestedRewardPoints: number
  pointsBalance: number
  minBalanceToRedeem: number
  maxRedemptionPct: number
  pointEurValue: number
  /** EUR-base FX rates for any required conversion (null when not loaded). */
  rates: EurBaseRates | null
}

/** Round to the currency's minor unit (e.g. 2 decimals for INR/USD, 3 for KWD). */
function roundToCurrency(amount: number, currency: string): number {
  const factor = 10 ** razorpayCurrencyExponent(currency)
  return Math.round(amount * factor) / factor
}

/** Rounding-only tolerance: one minor unit of the currency. */
function roundingTolerance(currency: string): number {
  return 1 / 10 ** razorpayCurrencyExponent(currency)
}

function fail(walletCurrency: string, validationResult: PriceValidation): CheckoutPriceAuthority {
  return {
    payableAmount: 0,
    walletCredit: 0,
    rewardCredit: 0,
    rewardPoints: 0,
    razorpayCharge: 0,
    walletCurrency,
    validationResult,
  }
}

/**
 * PURE: compute the authoritative charge and validate wallet / reward credits from
 * already-resolved data. No database or network access.
 */
export function computeCheckoutPriceAuthority(input: CheckoutPriceInputs): CheckoutPriceAuthority {
  const payCurrency = normalizeCurrencyCode(input.payCurrency) || 'INR'
  const rechargeCurrency = normalizeCurrencyCode(input.rechargeCurrency) || payCurrency
  const walletCurrency = normalizeCurrencyCode(input.walletCurrency) || payCurrency
  const tol = roundingTolerance(payCurrency)

  if (!Number.isFinite(input.rechargeTotal) || input.rechargeTotal <= 0) {
    return fail(walletCurrency, { ok: false, error: 'Invalid or missing pending checkout amount', status: 400 })
  }

  // 1. Payable base (pay currency). Same-currency reuses the stored amount; cross-
  //    currency converts with server-side rates only (never a client fxRate).
  let payableBase: number
  if (payCurrency === rechargeCurrency) {
    payableBase = roundToCurrency(input.rechargeTotal, payCurrency)
  } else {
    const converted = input.rates
      ? convertUsingEurBaseRates(input.rechargeTotal, rechargeCurrency, payCurrency, input.rates)
      : null
    if (converted == null) {
      return fail(walletCurrency, {
        ok: false,
        error: 'Unable to determine payable amount for cross-currency payment',
        status: 400,
      })
    }
    payableBase = roundToCurrency(converted, payCurrency)
  }

  // 2. Wallet credit (C4).
  let walletCredit = 0
  const requestedWallet = Number(input.requestedWalletAmount)
  if (Number.isFinite(requestedWallet) && requestedWallet > tol) {
    if (!input.userId) {
      return fail(walletCurrency, { ok: false, error: 'Wallet payment requires an authenticated user', status: 401 })
    }
    const walletBalance = Number(input.walletBalance)
    if (!Number.isFinite(walletBalance) || walletBalance <= 0) {
      return fail(walletCurrency, { ok: false, error: 'Insufficient wallet balance', status: 400 })
    }
    let balanceInPay = walletBalance
    if (walletCurrency !== payCurrency) {
      const converted = input.rates
        ? convertUsingEurBaseRates(walletBalance, walletCurrency, payCurrency, input.rates)
        : null
      if (converted == null) {
        return fail(walletCurrency, { ok: false, error: 'Unable to validate wallet balance', status: 400 })
      }
      balanceInPay = converted
    }
    const cap = balanceInPay * (input.maxConsumptionPct / 100)
    if (requestedWallet > balanceInPay + tol) {
      return fail(walletCurrency, { ok: false, error: 'Insufficient wallet balance', status: 400 })
    }
    if (requestedWallet > cap + tol) {
      return fail(walletCurrency, { ok: false, error: 'Exceeds maximum wallet consumption limit', status: 400 })
    }
    walletCredit = Math.min(roundToCurrency(requestedWallet, payCurrency), payableBase)
  }

  // 3. Reward credit (C4).
  let rewardPoints = 0
  let rewardCredit = 0
  const requestedPoints = Math.floor(Number(input.requestedRewardPoints))
  if (Number.isFinite(requestedPoints) && requestedPoints > 0) {
    if (!input.userId) {
      return fail(walletCurrency, { ok: false, error: 'Reward redemption requires an authenticated user', status: 401 })
    }
    const pointsBalance = Number(input.pointsBalance) || 0
    if (pointsBalance < requestedPoints) {
      return fail(walletCurrency, { ok: false, error: 'Insufficient reward points balance', status: 400 })
    }
    if (pointsBalance < input.minBalanceToRedeem) {
      return fail(walletCurrency, {
        ok: false,
        error: `You must have a balance of at least ${input.minBalanceToRedeem} points to redeem`,
        status: 400,
      })
    }
    const maxPointsAllowed = Math.floor(pointsBalance * (input.maxRedemptionPct / 100))
    if (requestedPoints > maxPointsAllowed) {
      return fail(walletCurrency, {
        ok: false,
        error: 'Exceeds maximum reward points redemption percentage limit',
        status: 400,
      })
    }
    const worthEur = requestedPoints * input.pointEurValue
    let worthInPay = worthEur
    if (payCurrency !== 'EUR') {
      const converted = input.rates
        ? convertUsingEurBaseRates(worthEur, 'EUR', payCurrency, input.rates)
        : null
      if (converted == null) {
        return fail(walletCurrency, { ok: false, error: 'Unable to value reward points', status: 400 })
      }
      worthInPay = converted
    }
    rewardPoints = requestedPoints
    rewardCredit = Math.min(
      roundToCurrency(worthInPay, payCurrency),
      Math.max(0, payableBase - walletCredit),
    )
  }

  const razorpayCharge = roundToCurrency(
    Math.max(0, payableBase - walletCredit - rewardCredit),
    payCurrency,
  )

  return {
    payableAmount: payableBase,
    walletCredit,
    rewardCredit,
    rewardPoints,
    razorpayCharge,
    walletCurrency,
    validationResult: { ok: true },
  }
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

/**
 * READ-ONLY loader: gathers the authoritative server-side data and delegates the
 * calculation to the pure `computeCheckoutPriceAuthority`. Performs no writes.
 */
export async function resolveCheckoutPriceAuthority(input: {
  userId: string | null
  checkoutSessionId: string
  payCurrency: string
  requestedWalletAmount: number
  walletCurrency: string
  requestedRewardPoints: number
}): Promise<CheckoutPriceAuthority> {
  const payCurrency = normalizeCurrencyCode(input.payCurrency) || 'INR'
  const walletCurrency = normalizeCurrencyCode(input.walletCurrency) || payCurrency

  // Authoritative total from the pending transaction.
  const txnRes = await supabaseRest(
    `transactions?id=eq.${encodeURIComponent(input.checkoutSessionId)}&select=amount,currency&limit=1`,
    { cache: 'no-store' },
  )
  if (!txnRes.ok) {
    return fail(walletCurrency, { ok: false, error: 'Unable to load checkout session', status: 400 })
  }
  const txnRows = (await txnRes.json().catch(() => [])) as Array<{ amount?: number; currency?: string }>
  const txn = txnRows[0]
  const rechargeTotal = Number(txn?.amount)
  const rechargeCurrency = normalizeCurrencyCode(txn?.currency) || payCurrency
  if (!txn || !Number.isFinite(rechargeTotal) || rechargeTotal <= 0) {
    return fail(walletCurrency, { ok: false, error: 'Invalid or missing pending checkout amount', status: 400 })
  }

  const requestedWallet = Number(input.requestedWalletAmount)
  const requestedPoints = Math.floor(Number(input.requestedRewardPoints))
  const usesWallet = Number.isFinite(requestedWallet) && requestedWallet > 0
  const usesPoints = Number.isFinite(requestedPoints) && requestedPoints > 0

  // Wallet balance + consumption cap (only when wallet is used by a logged-in user).
  let walletBalance: number | null = null
  let maxConsumptionPct = 100
  if (usesWallet && input.userId) {
    const walletRes = await supabaseRest(
      `wallets?user_id=eq.${encodeURIComponent(input.userId)}&currency=eq.${encodeURIComponent(
        walletCurrency,
      )}&select=balance&limit=1`,
      { cache: 'no-store' },
    )
    const walletRows = walletRes.ok
      ? ((await walletRes.json().catch(() => [])) as Array<{ balance?: number }>)
      : []
    walletBalance = walletRows.length ? Number(walletRows[0]?.balance) : null
    maxConsumptionPct = await readAppSettingNumber('wallet_max_consumption_percentage', 100)
  }

  // Reward balance + redemption settings (only when points are used by a logged-in user).
  let pointsBalance = 0
  let minBalanceToRedeem = 0
  let maxRedemptionPct = 50
  let pointEurValue = 0.01
  if (usesPoints && input.userId) {
    const balRes = await supabaseRest(
      `reward_accounts?user_id=eq.${encodeURIComponent(input.userId)}&select=points_balance&limit=1`,
      { cache: 'no-store' },
    )
    const balRows = balRes.ok
      ? ((await balRes.json().catch(() => [])) as Array<{ points_balance?: number }>)
      : []
    pointsBalance = Number(balRows[0]?.points_balance) || 0
    minBalanceToRedeem = await readAppSettingNumber('reward_min_balance_to_redeem', 0)
    maxRedemptionPct = await readAppSettingNumber('reward_max_redemption_percentage', 50)
    pointEurValue = await readAppSettingNumber('reward_point_eur_value', 0.01)
  }

  // Fetch FX rates once, only when a conversion is actually required.
  const needRates =
    payCurrency !== rechargeCurrency ||
    (usesWallet && walletCurrency !== payCurrency) ||
    (usesPoints && payCurrency !== 'EUR')
  const rates = needRates ? await fetchEurBaseRates() : null

  return computeCheckoutPriceAuthority({
    userId: input.userId,
    payCurrency,
    rechargeCurrency,
    rechargeTotal,
    requestedWalletAmount: requestedWallet,
    walletCurrency,
    walletBalance,
    maxConsumptionPct,
    requestedRewardPoints: requestedPoints,
    pointsBalance,
    minBalanceToRedeem,
    maxRedemptionPct,
    pointEurValue,
    rates,
  })
}
