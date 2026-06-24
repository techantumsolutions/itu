import { supabaseRest } from '@/lib/db/supabase-rest'

export const RECHARGE_PROCESSING_FEES_KEY = 'recharge_processing_fees'

export type RechargeProcessingFees = {
  taxPercent: number
  platformFeePercent: number
  paymentGatewayFeePercent: number
}

export type RechargeProcessingFeeAmounts = {
  tax: number
  platformFee: number
  paymentGatewayFee: number
  total: number
}

export const DEFAULT_RECHARGE_PROCESSING_FEES: RechargeProcessingFees = {
  taxPercent: 0,
  platformFeePercent: 2,
  paymentGatewayFeePercent: 0,
}

function finiteNonNegative(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 10000) / 10000
}

function clampPercent(value: unknown): number {
  return Math.min(100, finiteNonNegative(value))
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.round(value * 100) / 100
}

export function parseRechargeProcessingFees(value: unknown): RechargeProcessingFees {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  return {
    taxPercent: clampPercent(raw.tax_percent ?? raw.taxPercent ?? raw.tax),
    platformFeePercent: clampPercent(
      raw.platform_fee_percent ?? raw.platformFeePercent ?? raw.platform_fee ?? raw.platformFee,
    ),
    paymentGatewayFeePercent: clampPercent(
      raw.payment_gateway_fee_percent ??
        raw.paymentGatewayFeePercent ??
        raw.payment_gateway_fee ??
        raw.paymentGatewayFee,
    ),
  }
}

/** Sum of configured percentage rates (not a currency amount). */
export function totalRechargeProcessingFeePercent(fees: RechargeProcessingFees): number {
  return clampPercent(
    fees.taxPercent + fees.platformFeePercent + fees.paymentGatewayFeePercent,
  )
}

/** @deprecated Use totalRechargeProcessingFeePercent — kept for import compatibility. */
export const totalRechargeProcessingFee = totalRechargeProcessingFeePercent

export function computeRechargeProcessingFeeAmount(
  subtotal: number,
  fees: RechargeProcessingFees,
): RechargeProcessingFeeAmounts {
  const base = finiteNonNegative(subtotal)
  const tax = roundMoney((base * fees.taxPercent) / 100)
  const platformFee = roundMoney((base * fees.platformFeePercent) / 100)
  const paymentGatewayFee = roundMoney((base * fees.paymentGatewayFeePercent) / 100)
  return {
    tax,
    platformFee,
    paymentGatewayFee,
    total: roundMoney(tax + platformFee + paymentGatewayFee),
  }
}

/** Platform + payment gateway fees (excludes tax) for checkout display. */
export function computeRechargeServiceFeeAmount(
  subtotal: number,
  fees: RechargeProcessingFees,
): number {
  const { platformFee, paymentGatewayFee } = computeRechargeProcessingFeeAmount(subtotal, fees)
  return roundMoney(platformFee + paymentGatewayFee)
}

export function serializeRechargeProcessingFees(fees: RechargeProcessingFees): Record<string, unknown> {
  return {
    fee_type: 'percent',
    tax_percent: clampPercent(fees.taxPercent),
    platform_fee_percent: clampPercent(fees.platformFeePercent),
    payment_gateway_fee_percent: clampPercent(fees.paymentGatewayFeePercent),
  }
}

export async function loadRechargeProcessingFees(): Promise<RechargeProcessingFees> {
  try {
    const res = await supabaseRest(
      `app_settings?key=eq.${encodeURIComponent(RECHARGE_PROCESSING_FEES_KEY)}&select=value&limit=1`,
      { cache: 'no-store' },
    )
    if (!res.ok) return { ...DEFAULT_RECHARGE_PROCESSING_FEES }
    const rows = (await res.json()) as Array<{ value?: unknown }>
    if (!rows[0]?.value) return { ...DEFAULT_RECHARGE_PROCESSING_FEES }
    return parseRechargeProcessingFees(rows[0].value)
  } catch {
    return { ...DEFAULT_RECHARGE_PROCESSING_FEES }
  }
}

export async function saveRechargeProcessingFees(
  fees: RechargeProcessingFees,
): Promise<{ ok: boolean; error?: string }> {
  const payload = serializeRechargeProcessingFees(fees)
  const res = await supabaseRest('app_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([
      {
        key: RECHARGE_PROCESSING_FEES_KEY,
        value: payload,
        updated_at: new Date().toISOString(),
      },
    ]),
  })
  if (!res.ok) {
    return { ok: false, error: await res.text().catch(() => 'Failed to save recharge fees') }
  }
  return { ok: true }
}
