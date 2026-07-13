/** Billing period date-range rules for reconciliation invoice uploads. */

export const RECON_MAX_RANGE_DAYS = 92 // ~3 months
export const RECON_MAX_PAST_YEARS = 2

export type ReconciliationPeriodRange = {
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
}

export type ReconciliationPeriodValidation =
  | { ok: true; range: ReconciliationPeriodRange; billingPeriodLabel: string }
  | { ok: false; error: string }

function parseYmd(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1
}

/** Format a human-readable billing period label from a date range. */
export function formatBillingPeriodLabel(periodStart: string, periodEnd: string): string {
  if (periodStart === periodEnd) return periodStart
  return `${periodStart} – ${periodEnd}`
}

/**
 * Validate reconciliation billing date range.
 * - Both dates required (YYYY-MM-DD)
 * - End >= start
 * - End not after today
 * - Start not more than RECON_MAX_PAST_YEARS years ago
 * - Inclusive span <= RECON_MAX_RANGE_DAYS
 */
export function validateReconciliationPeriodRange(input: {
  periodStart?: string | null
  periodEnd?: string | null
  /** Optional override for tests / server clock */
  today?: Date
}): ReconciliationPeriodValidation {
  const startRaw = (input.periodStart ?? '').trim()
  const endRaw = (input.periodEnd ?? '').trim()

  if (!startRaw || !endRaw) {
    return { ok: false, error: 'Please select both start date and end date for the billing period.' }
  }

  const start = parseYmd(startRaw)
  const end = parseYmd(endRaw)
  if (!start || !end) {
    return { ok: false, error: 'Billing dates must be valid calendar dates (YYYY-MM-DD).' }
  }

  if (end.getTime() < start.getTime()) {
    return { ok: false, error: 'End date cannot be before start date.' }
  }

  const today = startOfLocalDay(input.today ?? new Date())
  if (start.getTime() > today.getTime()) {
    return { ok: false, error: 'Start date cannot be in the future.' }
  }
  if (end.getTime() > today.getTime()) {
    return { ok: false, error: 'End date cannot be in the future.' }
  }

  const earliest = new Date(today)
  earliest.setFullYear(earliest.getFullYear() - RECON_MAX_PAST_YEARS)
  if (start.getTime() < earliest.getTime()) {
    return {
      ok: false,
      error: `Start date cannot be more than ${RECON_MAX_PAST_YEARS} years in the past.`,
    }
  }

  const spanDays = daysBetweenInclusive(start, end)
  if (spanDays > RECON_MAX_RANGE_DAYS) {
    return {
      ok: false,
      error: `Date range cannot exceed ${RECON_MAX_RANGE_DAYS} days (about 3 months). Selected range is ${spanDays} days.`,
    }
  }

  return {
    ok: true,
    range: { periodStart: startRaw, periodEnd: endRaw },
    billingPeriodLabel: formatBillingPeriodLabel(startRaw, endRaw),
  }
}

/** Defaults: first day of previous calendar month → last day of previous month (clamped to today). */
export function defaultReconciliationPeriodRange(today = new Date()): ReconciliationPeriodRange {
  const y = today.getFullYear()
  const m = today.getMonth() // 0-based current month
  const firstPrev = new Date(y, m - 1, 1)
  const lastPrev = new Date(y, m, 0)
  const end = lastPrev.getTime() > today.getTime() ? today : lastPrev

  const fmt = (d: Date) => {
    const yy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }

  return { periodStart: fmt(firstPrev), periodEnd: fmt(end) }
}
