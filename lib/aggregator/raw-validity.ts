/**
 * Extract plan validity from provider raw JSON payloads.
 * Supports DT One ({ validity: { quantity, unit } }), DING (ValidityPeriodIso),
 * Value Topup ("5D"), ISO-8601 durations, and keyed validity/expiry fields.
 */

function toPositiveInt(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.round(n)
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

/** Parse ISO-8601 duration (e.g. P30D, P1M, P1Y) into approximate days. */
export function parseIso8601DurationToDays(iso: string): number | undefined {
  const trimmed = iso.trim().toUpperCase()
  if (!trimmed.startsWith('P')) return undefined

  const match = trimmed.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?/)
  if (!match) return undefined

  const years = toPositiveInt(match[1]) ?? 0
  const months = toPositiveInt(match[2]) ?? 0
  const weeks = toPositiveInt(match[3]) ?? 0
  const days = toPositiveInt(match[4]) ?? 0
  const total = years * 365 + months * 30 + weeks * 7 + days
  return total > 0 ? total : undefined
}

/** Parse compact duration strings like 5D, 28d, 2W, 1M. */
export function parseCompactDurationDays(value: string): number | undefined {
  const s = value.trim()
  const day = s.match(/^(\d+)\s*D$/i)
  if (day) return toPositiveInt(day[1])
  const week = s.match(/^(\d+)\s*W$/i)
  if (week) return toPositiveInt(week[1])! * 7
  const month = s.match(/^(\d+)\s*M$/i)
  if (month) return toPositiveInt(month[1])! * 30
  const year = s.match(/^(\d+)\s*Y$/i)
  if (year) return toPositiveInt(year[1])! * 365
  return undefined
}

/** Convert provider validity quantity + unit to whole days. */
export function validityUnitToDays(quantity: number, unit: string): number | undefined {
  const qty = toPositiveInt(quantity)
  if (qty == null) return undefined

  let u = unit.trim().toUpperCase()
  if (u.endsWith('S')) u = u.slice(0, -1)

  switch (u) {
    case 'DAY':
      return qty
    case 'HOUR':
      return Math.max(1, Math.round(qty / 24))
    case 'WEEK':
      return qty * 7
    case 'MONTH':
      return qty * 30
    case 'YEAR':
      return qty * 365
    default:
      return undefined
  }
}

function parseDtoneStyleValidity(node: unknown): number | undefined {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined
  const obj = node as Record<string, unknown>
  const qty = toPositiveInt(obj.quantity ?? obj.qty ?? obj.value ?? obj.amount)
  const unit = String(obj.unit ?? obj.unitType ?? obj.unit_type ?? obj.type ?? '').trim()
  if (qty != null && unit) return validityUnitToDays(qty, unit)
  return undefined
}

function parseValidityString(s: string): number | undefined {
  const trimmed = s.trim()
  if (!trimmed) return undefined
  if (/^life\s*time$/i.test(trimmed) || /^lifetime$/i.test(trimmed)) return undefined

  if (/^P/i.test(trimmed)) return parseIso8601DurationToDays(trimmed)

  const compact = parseCompactDurationDays(trimmed)
  if (compact != null) return compact

  const dayMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:days?|días?|dias?)\b/i)
  if (dayMatch) return toPositiveInt(dayMatch[1])

  // Plain integer strings only when short (avoid country codes like "91" in wrong context)
  if (/^\d{1,3}$/.test(trimmed)) return toPositiveInt(trimmed)

  return undefined
}

/** Parse a validity field value (string, number, or DT One object). */
export function parseValidityValue(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === 'number') return toPositiveInt(value)
  if (typeof value === 'string') return parseValidityString(value)
  if (typeof value === 'object' && !Array.isArray(value)) return parseDtoneStyleValidity(value)
  return undefined
}

const VALIDITY_OBJECT_KEYS = new Set(['validity', 'validityperiod', 'expiry', 'expiration'])
const VALIDITY_SCALAR_KEYS = new Set([
  'validitydays',
  'validityday',
  'validfordays',
  'validfor',
  'expirydays',
  'expiryday',
  'validityperiodiso',
  'validityperiod',
  'validityiso',
  'validityquantity',
  'validityperiodiso',
])

function isValidityKey(key: string): boolean {
  const nk = normalizeKey(key)
  if (nk.includes('countrycode') || nk.includes('phone') || nk.includes('dial')) return false
  if (VALIDITY_OBJECT_KEYS.has(nk) || VALIDITY_SCALAR_KEYS.has(nk)) return true
  if (nk === 'validity' || nk.endsWith('validity')) return true
  if (nk.includes('validityperiod')) return true
  if (nk.includes('expiry') || nk.includes('expiration')) return true
  return false
}

function tryKnownProviderPaths(raw: Record<string, unknown>): number | undefined {
  const directValidity = parseValidityValue(raw.validity)
  if (directValidity != null) return directValidity

  for (const key of [
    'ValidityPeriodIso',
    'ValidityPeriod',
    'validityPeriodIso',
    'validity_period_iso',
    'validityPeriod',
  ]) {
    const value = raw[key]
    if (typeof value === 'string') {
      const days = parseValidityString(value)
      if (days != null) return days
    }
  }

  const qty = toPositiveInt(raw.validityQuantity ?? raw.validity_quantity)
  const unit = String(raw.validityUnit ?? raw.validity_unit ?? '').trim()
  if (qty != null && unit) {
    const days = validityUnitToDays(qty, unit)
    if (days != null) return days
  }

  for (const key of ['validityDays', 'validity_days', 'expireDays', 'expiryDays', 'validForDays']) {
    const days = toPositiveInt(raw[key])
    if (days != null) return days
  }

  return undefined
}

function extractValidityFromDescription(raw: Record<string, unknown>): number | undefined {
  for (const key of [
    'productDescription',
    'additionalInformation',
    'description',
    'DefaultDisplayText',
  ]) {
    const text = raw[key]
    if (typeof text !== 'string') continue
    const patterns = [
      /(\d+)\s*Days?\s+validity/i,
      /validity[:\s]+(\d+)\s*Days?/i,
      /(\d+)\s*Days?\s+valid/i,
    ]
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const days = toPositiveInt(match[1])
        if (days != null) return days
      }
    }
  }
  return undefined
}

/** Walk objects for validity-named keys only (never bare array primitives like country codes). */
function walkForValidityKeys(node: unknown, depth = 0): number | undefined {
  if (node == null || depth > 12) return undefined
  if (typeof node !== 'object') return undefined

  if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item === 'object') {
        const days = walkForValidityKeys(item, depth + 1)
        if (days != null) return days
      }
    }
    return undefined
  }

  const obj = node as Record<string, unknown>
  const known = tryKnownProviderPaths(obj)
  if (known != null) return known

  for (const [key, value] of Object.entries(obj)) {
    if (!isValidityKey(key)) continue
    const days = parseValidityValue(value)
    if (days != null) return days
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const days = walkForValidityKeys(value, depth + 1)
      if (days != null) return days
    }
  }

  return undefined
}

/** Best-effort validity in days from any provider raw JSON. */
export function extractValidityDaysFromRaw(raw: unknown): number | undefined {
  if (raw == null) return undefined
  try {
    if (typeof raw !== 'object') return undefined
    const obj = raw as Record<string, unknown>
    return walkForValidityKeys(obj, 0) ?? extractValidityFromDescription(obj)
  } catch {
    return undefined
  }
}

/** Prefer connector-normalized days, then parse from raw JSON. */
export function resolveValidityDays(input: {
  validityDays?: number | null
  raw?: unknown
}): number | undefined {
  const explicit = toPositiveInt(input.validityDays ?? null)
  if (explicit != null) return explicit
  return extractValidityDaysFromRaw(input.raw)
}

export function isAirtimeLikePlan(input: {
  planType?: string | null
  category?: string | null
  raw?: unknown
}): boolean {
  const type = `${input.planType ?? ''} ${input.category ?? ''}`.toUpperCase()
  if (/\b(AIRTIME|PIN|TOPUP|TOP-UP|TOP_UP)\b/.test(type)) return true

  const raw = input.raw
  if (!raw || typeof raw !== 'object') return false
  const obj = raw as Record<string, unknown>
  const cat = String(obj.category ?? obj.benefitType ?? obj.planType ?? '').toUpperCase()
  return cat === 'PIN' || cat === 'AIRTIME'
}

/** Storage format for provider_plans_raw.validity / system_plans.validity. */
export function formatValidityDaysForStorage(days: number | null | undefined): string | null {
  const d = toPositiveInt(days ?? null)
  return d != null ? `${d}D` : null
}

/**
 * Resolve validity string for DB storage.
 * Uses explicit days, raw JSON validity, or "Life Time" for airtime plans with no expiry.
 */
export function resolveValidityForStorage(input: {
  validityDays?: number | null
  raw?: unknown
  planType?: string | null
  category?: string | null
}): string | null {
  const days = resolveValidityDays(input)
  if (days != null) return `${days}D`
  if (isAirtimeLikePlan(input)) return 'Life Time'
  return null
}
