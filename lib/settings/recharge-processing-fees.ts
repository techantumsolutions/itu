import { supabaseRest } from '@/lib/db/supabase-rest'

export const RECHARGE_PROCESSING_FEES_KEY = 'recharge_processing_fees'

export type RechargeProcessingFees = {
  taxPercent: number
  platformFeePercent: number
  paymentGatewayFeePercent: number
}

/** Inclusive recharge amount range with fee percentages for that band. */
export type RechargeProcessingFeeRange = RechargeProcessingFees & {
  id: string
  /** Inclusive lower bound (recharge face value / plan price). */
  minAmount: number
  /** Inclusive upper bound; null means no upper limit. */
  maxAmount: number | null
}

export type RechargeProcessingFeeConfig = {
  ranges: RechargeProcessingFeeRange[]
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

export const DEFAULT_RECHARGE_PROCESSING_FEE_CONFIG: RechargeProcessingFeeConfig = {
  ranges: [
    {
      id: 'default',
      minAmount: 0,
      maxAmount: null,
      ...DEFAULT_RECHARGE_PROCESSING_FEES,
    },
  ],
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

function newRangeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `range_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function parseFeePercents(raw: Record<string, unknown>): RechargeProcessingFees {
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

function parseOneRange(raw: unknown, index: number): RechargeProcessingFeeRange | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const percents = parseFeePercents(row)
  const minAmount = finiteNonNegative(row.min_amount ?? row.minAmount ?? 0)
  const maxRaw = row.max_amount ?? row.maxAmount
  let maxAmount: number | null = null
  if (maxRaw !== null && maxRaw !== undefined && maxRaw !== '') {
    maxAmount = finiteNonNegative(maxRaw)
    if (maxAmount < minAmount) maxAmount = minAmount
  }
  const rawId = typeof row.id === 'string' ? row.id.trim() : ''
  const id = rawId || `range_${index}_${minAmount}_${maxAmount ?? 'inf'}`

  return { id, minAmount, maxAmount, ...percents }
}

/**
 * Parse stored app_settings JSON.
 * Supports legacy flat percents and the new `ranges` array.
 */
export function parseRechargeProcessingFeeConfig(value: unknown): RechargeProcessingFeeConfig {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  const list = Array.isArray(raw.ranges) ? raw.ranges : null
  if (list && list.length > 0) {
    const ranges = list
      .map((item, i) => parseOneRange(item, i))
      .filter((r): r is RechargeProcessingFeeRange => r != null)
      .sort((a, b) => a.minAmount - b.minAmount || (a.maxAmount ?? Infinity) - (b.maxAmount ?? Infinity))
    if (ranges.length > 0) return { ranges }
  }

  // Legacy flat shape → one open-ended range
  const hasLegacy =
    raw.tax_percent != null ||
    raw.taxPercent != null ||
    raw.platform_fee_percent != null ||
    raw.platformFeePercent != null ||
    raw.payment_gateway_fee_percent != null ||
    raw.paymentGatewayFeePercent != null ||
    raw.fee_type === 'percent'

  if (hasLegacy || Object.keys(raw).length === 0) {
    const percents = hasLegacy ? parseFeePercents(raw) : { ...DEFAULT_RECHARGE_PROCESSING_FEES }
    return {
      ranges: [
        {
          id: 'default',
          minAmount: 0,
          maxAmount: null,
          ...percents,
        },
      ],
    }
  }

  return {
    ranges: DEFAULT_RECHARGE_PROCESSING_FEE_CONFIG.ranges.map((r) => ({ ...r })),
  }
}

/** @deprecated Prefer parseRechargeProcessingFeeConfig — returns first range / default flat fees. */
export function parseRechargeProcessingFees(value: unknown): RechargeProcessingFees {
  const config = parseRechargeProcessingFeeConfig(value)
  const first = config.ranges[0]
  if (!first) return { ...DEFAULT_RECHARGE_PROCESSING_FEES }
  return {
    taxPercent: first.taxPercent,
    platformFeePercent: first.platformFeePercent,
    paymentGatewayFeePercent: first.paymentGatewayFeePercent,
  }
}

export function amountMatchesFeeRange(amount: number, range: RechargeProcessingFeeRange): boolean {
  const base = finiteNonNegative(amount)
  if (base < range.minAmount) return false
  if (range.maxAmount == null) return true
  return base <= range.maxAmount
}

/** Pick fee percentages for a recharge amount already expressed in EUR. */
export function resolveRechargeProcessingFeesForAmount(
  amountEur: number,
  config: RechargeProcessingFeeConfig,
): RechargeProcessingFees & { rangeId: string | null } {
  const ranges = config.ranges ?? []
  const match = ranges.find((r) => amountMatchesFeeRange(amountEur, r))
  if (!match) {
    return { ...DEFAULT_RECHARGE_PROCESSING_FEES, rangeId: null }
  }
  return {
    taxPercent: match.taxPercent,
    platformFeePercent: match.platformFeePercent,
    paymentGatewayFeePercent: match.paymentGatewayFeePercent,
    rangeId: match.id,
  }
}

/**
 * Convert local recharge amount → EUR (using units-per-EUR rates), then resolve the fee band.
 * Range min/max in admin settings are always EUR.
 */
export function resolveRechargeProcessingFeesForLocalAmount(
  localAmount: number,
  localCurrency: string,
  config: RechargeProcessingFeeConfig,
  eurBaseRates: Record<string, number> | null | undefined,
): RechargeProcessingFees & { rangeId: string | null; amountEur: number | null } {
  const currency = (localCurrency || 'EUR').trim().toUpperCase()
  let amountEur: number | null = localAmount
  if (currency !== 'EUR') {
    if (!eurBaseRates) {
      return { ...DEFAULT_RECHARGE_PROCESSING_FEES, rangeId: null, amountEur: null }
    }
    // rates: units of currency per 1 EUR
    const rate = eurBaseRates[currency]
    if (!rate || rate <= 0) {
      return { ...DEFAULT_RECHARGE_PROCESSING_FEES, rangeId: null, amountEur: null }
    }
    amountEur = localAmount / rate
  }
  if (amountEur == null || !Number.isFinite(amountEur)) {
    return { ...DEFAULT_RECHARGE_PROCESSING_FEES, rangeId: null, amountEur: null }
  }
  const resolved = resolveRechargeProcessingFeesForAmount(amountEur, config)
  return { ...resolved, amountEur }
}

/** Sum of configured percentage rates (not a currency amount). */
export function totalRechargeProcessingFeePercent(fees: RechargeProcessingFees): number {
  return clampPercent(fees.taxPercent + fees.platformFeePercent + fees.paymentGatewayFeePercent)
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

/** Resolve range for amount then compute fee amounts. */
export function computeRechargeProcessingFeeAmountForConfig(
  subtotal: number,
  config: RechargeProcessingFeeConfig,
): RechargeProcessingFeeAmounts & { rangeId: string | null; fees: RechargeProcessingFees } {
  const fees = resolveRechargeProcessingFeesForAmount(subtotal, config)
  const amounts = computeRechargeProcessingFeeAmount(subtotal, fees)
  return { ...amounts, rangeId: fees.rangeId, fees }
}

/** Platform + payment gateway fees (excludes tax) for checkout display. */
export function computeRechargeServiceFeeAmount(
  subtotal: number,
  fees: RechargeProcessingFees,
): number {
  const { platformFee, paymentGatewayFee } = computeRechargeProcessingFeeAmount(subtotal, fees)
  return roundMoney(platformFee + paymentGatewayFee)
}

export type FeeRangeValidation =
  | { ok: true; config: RechargeProcessingFeeConfig }
  | { ok: false; error: string }

export function formatRangeLabel(range: RechargeProcessingFeeRange): string {
  const min = range.minAmount.toFixed(2)
  if (range.maxAmount == null) return `€${min}+`
  return `€${min} – €${range.maxAmount.toFixed(2)}`
}

/** Validate and normalize ranges before save. */
export function validateRechargeProcessingFeeRanges(input: unknown): FeeRangeValidation {
  const rawList = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray((input as { ranges?: unknown }).ranges)
      ? (input as { ranges: unknown[] }).ranges
      : null

  if (!rawList || rawList.length === 0) {
    return { ok: false, error: 'Add at least one recharge price range.' }
  }

  const ranges: RechargeProcessingFeeRange[] = []
  for (let i = 0; i < rawList.length; i++) {
    const parsed = parseOneRange(rawList[i], i)
    if (!parsed) {
      return { ok: false, error: `Range #${i + 1} is invalid.` }
    }
    const rawId =
      rawList[i] && typeof rawList[i] === 'object'
        ? String((rawList[i] as { id?: string }).id ?? '').trim()
        : ''
    ranges.push({
      ...parsed,
      id: rawId || newRangeId(),
    })
  }

  ranges.sort(
    (a, b) => a.minAmount - b.minAmount || (a.maxAmount ?? Infinity) - (b.maxAmount ?? Infinity),
  )

  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (r.maxAmount != null && r.maxAmount < r.minAmount) {
      return {
        ok: false,
        error: `Range ${i + 1}: max amount must be greater than or equal to min amount.`,
      }
    }
  }

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]
      const b = ranges[j]
      const aMax = a.maxAmount ?? Infinity
      const bMax = b.maxAmount ?? Infinity
      const overlaps = a.minAmount <= bMax && b.minAmount <= aMax
      if (overlaps) {
        return {
          ok: false,
          error: `Ranges overlap: ${formatRangeLabel(a)} and ${formatRangeLabel(b)}. Adjust min/max so bands do not overlap.`,
        }
      }
    }
  }

  return { ok: true, config: { ranges } }
}

export function serializeRechargeProcessingFeeConfig(
  config: RechargeProcessingFeeConfig,
): Record<string, unknown> {
  return {
    fee_type: 'percent_ranges',
    ranges: config.ranges.map((r) => ({
      id: r.id,
      min_amount: finiteNonNegative(r.minAmount),
      max_amount: r.maxAmount == null ? null : finiteNonNegative(r.maxAmount),
      tax_percent: clampPercent(r.taxPercent),
      platform_fee_percent: clampPercent(r.platformFeePercent),
      payment_gateway_fee_percent: clampPercent(r.paymentGatewayFeePercent),
    })),
  }
}

/** @deprecated Prefer serializeRechargeProcessingFeeConfig */
export function serializeRechargeProcessingFees(fees: RechargeProcessingFees): Record<string, unknown> {
  return serializeRechargeProcessingFeeConfig({
    ranges: [
      {
        id: 'default',
        minAmount: 0,
        maxAmount: null,
        ...fees,
      },
    ],
  })
}

export async function loadRechargeProcessingFeeConfig(): Promise<RechargeProcessingFeeConfig> {
  try {
    const res = await supabaseRest(
      `app_settings?key=eq.${encodeURIComponent(RECHARGE_PROCESSING_FEES_KEY)}&select=value&limit=1`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      return {
        ranges: DEFAULT_RECHARGE_PROCESSING_FEE_CONFIG.ranges.map((r) => ({ ...r })),
      }
    }
    const rows = (await res.json()) as Array<{ value?: unknown }>
    if (!rows[0]?.value) {
      return {
        ranges: DEFAULT_RECHARGE_PROCESSING_FEE_CONFIG.ranges.map((r) => ({ ...r })),
      }
    }
    return parseRechargeProcessingFeeConfig(rows[0].value)
  } catch {
    return {
      ranges: DEFAULT_RECHARGE_PROCESSING_FEE_CONFIG.ranges.map((r) => ({ ...r })),
    }
  }
}

/** @deprecated Prefer loadRechargeProcessingFeeConfig + resolveRechargeProcessingFeesForAmount */
export async function loadRechargeProcessingFees(): Promise<RechargeProcessingFees> {
  const config = await loadRechargeProcessingFeeConfig()
  return resolveRechargeProcessingFeesForAmount(0, config)
}

export async function saveRechargeProcessingFeeConfig(
  config: RechargeProcessingFeeConfig,
): Promise<{ ok: boolean; error?: string }> {
  const validated = validateRechargeProcessingFeeRanges(config)
  if (!validated.ok) return { ok: false, error: validated.error }

  const payload = serializeRechargeProcessingFeeConfig(validated.config)
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

/** @deprecated Prefer saveRechargeProcessingFeeConfig */
export async function saveRechargeProcessingFees(
  fees: RechargeProcessingFees,
): Promise<{ ok: boolean; error?: string }> {
  return saveRechargeProcessingFeeConfig({
    ranges: [
      {
        id: 'default',
        minAmount: 0,
        maxAmount: null,
        ...fees,
      },
    ],
  })
}

export function createEmptyFeeRange(afterMax?: number | null): RechargeProcessingFeeRange {
  const minAmount =
    afterMax != null && Number.isFinite(afterMax) ? Math.round((afterMax + 0.01) * 100) / 100 : 0
  return {
    id: newRangeId(),
    minAmount,
    maxAmount: null,
    taxPercent: 0,
    platformFeePercent: 2,
    paymentGatewayFeePercent: 0,
  }
}
