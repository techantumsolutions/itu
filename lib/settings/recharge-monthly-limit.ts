import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  convertWithRateMap,
  getFallbackExchangeRates,
  LCR_BASE_CURRENCY,
  loadCatalogExchangeRates,
} from '@/lib/routing/exchange-rates'
import {
  convertUsingEurBaseRates,
  fetchEurBaseRates,
  type EurBaseRates,
} from '@/lib/checkout/currency-conversion'
import type { RechargeProcessingFeeConfig } from '@/lib/settings/recharge-processing-fees'

const MONTHLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/** Successful recharge statuses that count toward the 30-day EUR cap. */
const COUNTABLE_RECHARGE_STATUSES = ['completed', 'success', 'fulfilled', 'done']

/**
 * Highest finite max_amount across fee ranges (EUR).
 * Used as the rolling 30-day recharge limit. Returns null if no finite max is configured.
 */
export function getMonthlyRechargeLimitEur(config: RechargeProcessingFeeConfig): number | null {
  let max = -Infinity
  for (const r of config.ranges ?? []) {
    if (r.maxAmount != null && Number.isFinite(r.maxAmount) && r.maxAmount > 0) {
      max = Math.max(max, r.maxAmount)
    }
  }
  return max > 0 && Number.isFinite(max) ? Math.round(max * 100) / 100 : null
}

/** Convert an amount into EUR using live FX → catalog rates → static fallbacks. */
export async function convertAmountToEur(
  amount: number,
  currency: string,
  eurBaseRates?: EurBaseRates | null,
): Promise<number | null> {
  if (!Number.isFinite(amount) || amount < 0) return null
  const from = (currency || 'EUR').trim().toUpperCase()
  if (from === 'EUR' || from === LCR_BASE_CURRENCY) return amount

  let rates = eurBaseRates
  if (rates) {
    const viaOpen = convertUsingEurBaseRates(amount, from, 'EUR', rates)
    if (viaOpen != null && Number.isFinite(viaOpen)) return viaOpen
  }

  // Always try live EUR-base rates when caller didn't supply (or currency missing from map).
  rates = await fetchEurBaseRates()
  if (rates) {
    const viaOpen = convertUsingEurBaseRates(amount, from, 'EUR', rates)
    if (viaOpen != null && Number.isFinite(viaOpen)) return viaOpen
  }

  try {
    const rateMap = await loadCatalogExchangeRates(LCR_BASE_CURRENCY)
    const { converted } = convertWithRateMap(
      amount,
      from,
      LCR_BASE_CURRENCY,
      rateMap,
      getFallbackExchangeRates(),
    )
    if (Number.isFinite(converted) && converted >= 0) return converted
  } catch {
    /* fall through */
  }

  const fb = getFallbackExchangeRates()[from]
  if (fb != null && fb > 0) return amount * fb

  return null
}

export type MonthlyRechargeUsage = {
  limitEur: number | null
  usedEur: number
  remainingEur: number | null
  windowStartedAt: string
  windowEndsAt: string
}

async function sumRechargeOrdersEur(params: {
  userId?: string | null
  phoneNumber?: string | null
  sinceIso: string
}): Promise<number> {
  const statusFilter = COUNTABLE_RECHARGE_STATUSES.map(encodeURIComponent).join(',')
  const filters: string[] = [
    `created_at=gte.${encodeURIComponent(params.sinceIso)}`,
    `status=in.(${statusFilter})`,
    'select=send_amount,send_currency,receive_amount,receive_currency,phone_number,user_id,created_at',
    'limit=5000',
  ]
  if (params.userId) {
    filters.unshift(`user_id=eq.${encodeURIComponent(params.userId)}`)
  } else if (params.phoneNumber) {
    filters.unshift(`phone_number=eq.${encodeURIComponent(params.phoneNumber)}`)
  } else {
    return 0
  }

  const res = await supabaseRest(`recharge_orders?${filters.join('&')}`, { cache: 'no-store' })
  if (!res.ok) return 0
  const rows = (await res.json().catch(() => [])) as Array<{
    send_amount?: number | string | null
    send_currency?: string | null
    receive_amount?: number | string | null
    receive_currency?: string | null
  }>

  let total = 0
  for (const row of rows) {
    const send = Number(row.send_amount)
    const receive = Number(row.receive_amount)
    // Prefer face-value receive amount when present; else send amount
    const amount = Number.isFinite(receive) && receive > 0 ? receive : send
    const currency =
      Number.isFinite(receive) && receive > 0
        ? row.receive_currency || row.send_currency || 'EUR'
        : row.send_currency || row.receive_currency || 'EUR'
    if (!Number.isFinite(amount) || amount <= 0) continue
    const eur = await convertAmountToEur(amount, String(currency))
    if (eur != null) total += eur
  }
  return Math.round(total * 100) / 100
}

export async function getMonthlyRechargeUsage(input: {
  config: RechargeProcessingFeeConfig
  userId?: string | null
  phoneNumber?: string | null
}): Promise<MonthlyRechargeUsage> {
  const limitEur = getMonthlyRechargeLimitEur(input.config)
  const now = Date.now()
  const since = new Date(now - MONTHLY_WINDOW_MS)
  const usedEur =
    limitEur == null
      ? 0
      : await sumRechargeOrdersEur({
          userId: input.userId,
          phoneNumber: input.phoneNumber,
          sinceIso: since.toISOString(),
        })

  const remainingEur =
    limitEur == null ? null : Math.max(0, Math.round((limitEur - usedEur) * 100) / 100)

  return {
    limitEur,
    usedEur,
    remainingEur,
    windowStartedAt: since.toISOString(),
    windowEndsAt: new Date(now + MONTHLY_WINDOW_MS).toISOString(),
  }
}

export type MonthlyLimitCheckResult =
  | { ok: true; usage: MonthlyRechargeUsage; planPriceEur: number }
  | {
      ok: false
      code: 'FX_CONVERSION_FAILED' | 'PLAN_EXCEEDS_BAND' | 'MONTHLY_LIMIT_EXCEEDED'
      error: string
      usage: MonthlyRechargeUsage
      planPriceEur: number
    }

/**
 * Enforce that plan face value (in EUR) fits within the rolling 30-day EUR recharge cap.
 */
export async function assertWithinMonthlyRechargeLimit(input: {
  config: RechargeProcessingFeeConfig
  planPrice: number
  planCurrency: string
  userId?: string | null
  phoneNumber?: string | null
  eurBaseRates?: EurBaseRates | null
}): Promise<MonthlyLimitCheckResult> {
  const usage = await getMonthlyRechargeUsage({
    config: input.config,
    userId: input.userId,
    phoneNumber: input.phoneNumber,
  })

  const planPriceEur = await convertAmountToEur(
    input.planPrice,
    input.planCurrency,
    input.eurBaseRates,
  )

  if (planPriceEur == null) {
    return {
      ok: false,
      code: 'FX_CONVERSION_FAILED',
      error: `Unable to convert recharge amount to EUR for limit checks (${input.planCurrency}).`,
      usage,
      planPriceEur: 0,
    }
  }

  if (usage.limitEur == null) {
    return { ok: true, usage, planPriceEur }
  }

  if (planPriceEur > usage.limitEur + 1e-9) {
    return {
      ok: false,
      code: 'PLAN_EXCEEDS_BAND',
      error: `This recharge (€${planPriceEur.toFixed(2)}) exceeds the maximum allowed recharge band of €${usage.limitEur.toFixed(2)}.`,
      usage,
      planPriceEur,
    }
  }

  if (usage.usedEur + planPriceEur > usage.limitEur + 1e-9) {
    const remaining = usage.remainingEur ?? 0
    return {
      ok: false,
      code: 'MONTHLY_LIMIT_EXCEEDED',
      error: `Your monthly recharge limit is exceeded. You have used €${usage.usedEur.toFixed(2)} of €${usage.limitEur.toFixed(2)} in the last 30 days. Remaining this month: €${remaining.toFixed(2)}.`,
      usage,
      planPriceEur,
    }
  }

  return { ok: true, usage, planPriceEur }
}
