import type { NormalizedPlan } from '@/lib/providers/types'

/** Product / record category used during provider sync. */
export type OperatorRecordKind =
  | 'MOBILE_OPERATOR'
  | 'MOBILE_PLAN'
  | 'AIRTIME'
  | 'DATA_BUNDLE'
  | 'COMBO_BUNDLE'
  | 'GIFT_CARD'
  | 'DTH'
  | 'DIGITAL_VOUCHER'
  | 'UTILITY'
  | 'UNKNOWN'

/** Machine-readable reason when operator creation is skipped. */
export type SkippedOperatorReason =
  | 'DATA_PLAN'
  | 'MOBILE_PLAN'
  | 'AIRTIME_DENOMINATION'
  | 'PRODUCT_CODE'
  | 'GIFT_CARD'
  | 'DIGITAL_VOUCHER'
  | 'DTH'
  | 'COMBO_BUNDLE'
  | 'BUNDLE_KEYWORD'
  | 'UTILITY'
  | 'OTT'
  | 'NOT_TELECOM_OPERATOR'
  | 'RANDOM_OR_CODE_LIKE_NAME'
  | 'EMPTY_NAME'

export type OperatorClassification = {
  kind: OperatorRecordKind
  isTelecomOperator: boolean
  skipReason: SkippedOperatorReason | null
  /** 0–100 confidence that the name is a real telecom brand (final validation layer). */
  nameConfidence?: number
  warnings: string[]
}

export type ProviderOperatorContext = {
  providerOperatorName: string
  providerOperatorId?: string | null
  productName?: string | null
  serviceType?: string | null
  category?: string | null
  operatorType?: string | null
  countryIso3?: string | null
  plan?: NormalizedPlan
  rawResponseJson?: unknown
}

const CURRENCY_CODES =
  'USD|EUR|GBP|INR|NGN|MYR|BDT|IDR|PHP|THB|VND|SGD|AUD|CAD|AED|SAR|PKR|LKR|KES|GHS|ZAR|BRL|MXN|PLN|RON|CZK|HUF|SEK|NOK|DKK|CHF|JPY|CNY|HKD|TWD|KRW'

const AIRTIME_DENOMINATION_RE = new RegExp(
  `^\\d+(?:\\.\\d+)?\\s*(?:${CURRENCY_CODES})$`,
  'i',
)

const DATA_VOLUME_RE = /\d+\s*(?:GB|MB|TB)\b/i

const PRODUCT_CODE_RE = /^[a-z0-9]{4,}in$/i

const COUNTRY_SUFFIX_RE =
  /\s+(?:IND|NGA|GHA|KEN|MYS|PHL|IDN|BGD|USA|GBR|AUS|CAN|ZAF|BRA|MEX|PAK|LKA|BGD|VNM|THA|SGP|HKG|TWN|KOR|JPN|CHN|UAE|SAU|QAT|KWT|OMN|BHR|EGY|MAR|TUN|DZA|ETH|UGA|TZA|ZMB|MWI|MOZ|COD|CMR|SEN|CIV|BEN|TGO|NER|MLI|BFA|GIN|GNB|SLE|LBR|GMB|SWZ|LSO|BWA|NAM|AGO|RWA|BDI|SSD|SOM|DJI|ERI|GAB|COG|CAF|TCD|MRU|ESH|NPL|MMR|KHM|LAO|MNG|BTN|MDV|FJI|PNG|SLB|VUT|WSM|TON|KIR|TUV|NRU|PLW|FSM|MHL|COK|NIU|TKL|WLF|PYF|NCL|GUM|MNP|ASM|VIR|PRI|GTM|HND|SLV|NIC|CRI|PAN|BLZ|JAM|HTI|DOM|CUB|TTO|BRB|GRD|LCA|VCT|ATG|DMA|KNA|BHS|CYM|ABW|CUW|SXM|MAF|GLP|MTQ|GUF|REU|MYT|COM|MDG|MUS|SYC|CPV|STP|GNQ|SHN|IOT|PCN|SGS|ATA|BVT|HMD|ATF|UMI|SPM|ALA|JEY|GGY|IMN|FRO|GRL|SJM|ALA)(?:\s|$)/i

const GIFT_CARD_KEYWORDS_RE =
  /\b(gift|voucher|basket|hotel|hyatt|amazon|steam|netflix|google\s*play|prepaid\s*card|gift\s*card)\b/i

const GIFT_CARD_WITH_CARD_RE = /\bcard\b/i

const DTH_RE =
  /\b(dth|dish\s*tv|sun\s*direct|videocon|tata\s*play|airtel\s*dth)\b/i

const OTT_RE = /\b(ott|hotstar|prime\s*video|disney|netflix|spotify|zee5|sonyliv)\b/i

const BUNDLE_KEYWORDS_RE =
  /\b(data|gb|mb|tb|ott|calls?|sms|voice|pack|bundle|unlimited|roaming|top\s*up|topup|recharge|subs|subscription|joy\s*pack|combo)\b/i

const UTILITY_RE =
  /\b(electricity|electric\s*bill|water\s*bill|gas\s*bill|utility|broadband\s*bill|internet\s*bill|postpaid\s*bill)\b/i

const MOBILE_PLAN_HINT_RE =
  /\b(plan|package|pkg|validity|days?|months?|annual|yearly)\b/i

/** Known mobile network operators per country (strict allow-list for ambiguous short names). */
const KNOWN_MOBILE_OPERATORS: Record<string, string[]> = {
  IND: [
    'AIRTEL',
    'JIO',
    'RELIANCE JIO',
    'VI',
    'VODAFONE',
    'VODAFONE IDEA',
    'IDEA',
    'BSNL',
    'MTNL',
  ],
  NGA: ['AIRTEL', 'MTN', 'GLO', '9MOBILE', 'ETISALAT'],
  GHA: ['MTN', 'VODAFONE', 'AIRTELTIGO', 'TIGO'],
  KEN: ['SAFARICOM', 'AIRTEL', 'TELKOM'],
  MYS: ['CELCOM', 'DIGI', 'MAXIS', 'UMOBILE', 'UNIFI'],
  PHL: ['GLOBE', 'SMART', 'TNT', 'SUN'],
  IDN: ['TELKOMSEL', 'INDOSAT', 'XL', 'TRI', 'SMARTFREN'],
  BGD: ['GRAMEENPHONE', 'ROBI', 'BANGLALINK', 'TELETALK'],
  USA: ['AT&T', 'ATT', 'T-MOBILE', 'TMOBILE', 'VERIZON', 'SPRINT'],
  GBR: ['EE', 'O2', 'VODAFONE', 'THREE', 'TESCO'],
}

/** Common telecom / business naming fragments (Rule 3). */
const BUSINESS_OPERATOR_PATTERN_RE =
  /\b(telecom|telecommunications|telekom|telefonica|mobile|wireless|communications|communicaciones|telecomunicaciones|network|cellular|cellcom|carrier|group|company|corp|limited|ltd|inc|llc|india|jio|airtel|vodafone|reliance|bsnl|mtnl|orange|claro|movistar|telenor|telstra|ooredoo|etisalat|safaricom|mtn|globe|smart|celcom|digi|maxis)\b/i

const CODE_LIKE_SUFFIX_RE = /^[a-z]{2,5}in$/i

const ACCEPT_CONFIDENCE_THRESHOLD = 50

function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

/** Strip trailing country code token often appended during normalization (e.g. "2 Gb Data IND"). */
export function stripCountrySuffix(name: string): string {
  const n = normalizeName(name)
  const without = n.replace(COUNTRY_SUFFIX_RE, '').trim()
  return without || n
}

function nameForRules(name: string): string {
  return stripCountrySuffix(name)
}

function upperCompact(name: string): string {
  return nameForRules(name).toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isNumericOnly(name: string): boolean {
  const trimmed = nameForRules(name).trim()
  return trimmed.length > 0 && /^[\d.,\s]+$/.test(trimmed)
}

export function isDataPlanName(name: string): boolean {
  const n = nameForRules(name)
  if (DATA_VOLUME_RE.test(n)) return true
  if (/\bunlimited\b/i.test(n) && /\bdata\b/i.test(n)) return true
  return false
}

export function isAirtimeDenominationName(name: string): boolean {
  const n = nameForRules(name)
  if (AIRTIME_DENOMINATION_RE.test(n)) return true
  const compact = n.replace(/\s+/g, ' ')
  return /^\d+(?:\.\d+)?\s*(?:USD|EUR|INR|GBP|MYR|NGN)$/i.test(compact)
}

export function isProductCodeName(name: string): boolean {
  const core = nameForRules(name).replace(/\s+/g, '').toLowerCase()
  return PRODUCT_CODE_RE.test(core)
}

export function isGiftCardName(name: string): boolean {
  const n = nameForRules(name)
  if (GIFT_CARD_KEYWORDS_RE.test(n)) return true
  if (GIFT_CARD_WITH_CARD_RE.test(n) && /\d{3,}/.test(n)) return true
  return false
}

export function isDthName(name: string): boolean {
  return DTH_RE.test(nameForRules(name))
}

export function isBundleKeywordName(name: string): boolean {
  const n = nameForRules(name)
  if (BUNDLE_KEYWORDS_RE.test(n)) return true
  if (MOBILE_PLAN_HINT_RE.test(n) && !isKnownMobileOperatorName(n, null)) return true
  return false
}

export function isOttName(name: string): boolean {
  return OTT_RE.test(nameForRules(name))
}

/** True when the normalized name exactly matches a known operator for the country. */
export function isKnownMobileOperatorName(name: string, countryIso3?: string | null): boolean {
  const country = (countryIso3 ?? '').toUpperCase()
  const known = KNOWN_MOBILE_OPERATORS[country]
  if (!known?.length) return false

  const upper = upperCompact(name)
  if (!upper) return false

  return known.some((op) => {
    if (upper === op) return true
    if (upper.startsWith(`${op} `)) return true
    if (upper.endsWith(` ${op}`)) return true
    return false
  })
}

function containsDthMarker(value: string): boolean {
  const lower = value.toLowerCase()
  return /(?:^|[^a-z])dth(?:[^a-z]|$)/.test(lower) || lower.includes('dth_') || lower.includes('_dth')
}

function humanizeProviderCode(code: string): string | null {
  const trimmed = code.trim()
  if (!trimmed) return null
  if (containsDthMarker(trimmed) || isDthName(trimmed)) return null
  const segments = trimmed.split(/[:/_-]/).filter(Boolean)
  if (segments.some((seg) => containsDthMarker(seg))) return null
  const base = segments[0]?.replace(/\d+$/g, '').trim()
  if (!base || /^\d+$/.test(base)) return null
  if (isProductCodeName(base) || isAirtimeDenominationName(base)) return null
  return base
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function vowelCount(word: string): number {
  return (word.match(/[aeiou]/gi) ?? []).length
}

function hasRecognizableWordShape(word: string): boolean {
  if (word.length < 6) return false
  return vowelCount(word) >= 2
}

/**
 * Confidence that a name represents a real telecom brand (0–100).
 * Used only by the final random/code-like validation layer.
 */
export function operatorNameConfidenceScore(name: string, countryIso3?: string | null): number {
  const clean = nameForRules(name)
  if (!clean) return 0

  if (isKnownMobileOperatorName(clean, countryIso3)) return 98

  const words = clean.split(/\s+/).filter(Boolean)
  let score = 45

  if (words.length >= 2) score += 28
  if (words.length >= 3) score += 8
  if (BUSINESS_OPERATOR_PATTERN_RE.test(clean)) score += 22

  const primary = words[0] ?? ''
  if (hasRecognizableWordShape(primary)) score += 18

  if (words.length === 1) {
    score -= 22
    if (primary.length < 6) score -= 18
    if (primary.length <= 3) score -= 20
    if (CODE_LIKE_SUFFIX_RE.test(primary)) score -= 28
    if (vowelCount(primary) <= 1 && primary.length >= 4) score -= 22
    if (looksLikeRandomToken(primary)) score -= 35
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

function looksLikeRandomToken(word: string): boolean {
  const w = word.trim()
  if (!w) return true
  const lower = w.toLowerCase()

  if (lower.length <= 3) return true
  if (CODE_LIKE_SUFFIX_RE.test(lower)) return true
  if (vowelCount(lower) === 0) return true
  if (lower.length <= 5 && vowelCount(lower) <= 1 && /[^aeiou]{2,}/i.test(lower)) return true

  return false
}

/**
 * Final validation gate — runs after all existing classification rules.
 * Does not replace plan/gift/DTH/denomination filters.
 */
export function isRandomOrCodeLikeOperatorName(name: string, countryIso3?: string | null): boolean {
  if (isKnownMobileOperatorName(name, countryIso3)) return false

  const clean = nameForRules(name)
  const words = clean.split(/\s+/).filter(Boolean)
  if (!words.length) return true

  const score = operatorNameConfidenceScore(name, countryIso3)
  if (score >= ACCEPT_CONFIDENCE_THRESHOLD) return false

  const rule1SingleWord = words.length === 1
  const rule2ShortToken = words[0].length < 8
  const rule3NoBusinessPattern = !BUSINESS_OPERATOR_PATTERN_RE.test(clean)

  return rule1SingleWord && rule2ShortToken && rule3NoBusinessPattern
}

function applyFinalOperatorNameValidation(
  accepted: OperatorClassification,
  name: string,
  countryIso3?: string | null,
): OperatorClassification {
  if (!accepted.isTelecomOperator || accepted.kind !== 'MOBILE_OPERATOR') return accepted

  const confidence = operatorNameConfidenceScore(name, countryIso3)
  if (!isRandomOrCodeLikeOperatorName(name, countryIso3)) {
    return { ...accepted, nameConfidence: confidence }
  }

  return {
    kind: 'UNKNOWN',
    isTelecomOperator: false,
    skipReason: 'RANDOM_OR_CODE_LIKE_NAME',
    nameConfidence: confidence,
    warnings: [],
  }
}

function detectSkipReason(name: string, countryIso3?: string | null): SkippedOperatorReason | null {
  const n = nameForRules(name)
  if (!n) return 'EMPTY_NAME'
  if (isNumericOnly(n)) return 'AIRTIME_DENOMINATION'
  if (isProductCodeName(n)) return 'PRODUCT_CODE'
  if (isAirtimeDenominationName(n)) return 'AIRTIME_DENOMINATION'
  if (isDthName(n)) return 'DTH'
  if (isGiftCardName(n)) return 'GIFT_CARD'
  if (/\b(voucher|evoucher)\b/i.test(n)) return 'DIGITAL_VOUCHER'
  if (UTILITY_RE.test(n)) return 'UTILITY'
  if (isDataPlanName(n)) return 'DATA_PLAN'
  if (isOttName(n)) return 'OTT'
  if (/\bcombo\b/i.test(n) || (/\b(data|voice|calls?)\b/i.test(n) && /\b(data|voice|calls?|sms)\b/i.test(n))) {
    return 'COMBO_BUNDLE'
  }
  if (isBundleKeywordName(n) && !isKnownMobileOperatorName(n, countryIso3)) return 'BUNDLE_KEYWORD'
  if (MOBILE_PLAN_HINT_RE.test(n) && !isKnownMobileOperatorName(n, countryIso3)) return 'MOBILE_PLAN'
  return null
}

/** Operator identity fields only — excludes plan/product titles (e.g. Ding SKU display names). */
export function collectOperatorNames(input: ProviderOperatorContext): string[] {
  const raw: Record<string, unknown> =
    input.rawResponseJson && typeof input.rawResponseJson === 'object'
      ? (input.rawResponseJson as Record<string, unknown>)
      : {}

  const planRaw: Record<string, unknown> =
    input.plan?.raw && typeof input.plan.raw === 'object'
      ? (input.plan.raw as Record<string, unknown>)
      : {}

  const candidates = [
    input.providerOperatorName,
    input.plan?.operatorName,
    typeof raw.operatorName === 'string' ? raw.operatorName : null,
    typeof planRaw.dingProviderName === 'string' ? planRaw.dingProviderName : null,
    typeof planRaw.providerName === 'string' ? planRaw.providerName : null,
    typeof (raw.operator as { name?: string } | undefined)?.name === 'string'
      ? (raw.operator as { name: string }).name
      : null,
  ]

  const seen = new Set<string>()
  const out: string[] = []
  for (const c of candidates) {
    const n = normalizeName(c ?? '')
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    out.push(n)
  }
  return out
}

export function classifyProviderOperatorRecord(input: ProviderOperatorContext): OperatorClassification {
  const country = input.countryIso3 ?? input.plan?.countryIso3 ?? null
  const namesToCheck = collectOperatorNames(input)
  const primaryName = namesToCheck[0] ?? ''

  if (!primaryName) {
    return {
      kind: 'UNKNOWN',
      isTelecomOperator: false,
      skipReason: 'EMPTY_NAME',
      warnings: [],
    }
  }

  for (const name of namesToCheck) {
    const skipReason = detectSkipReason(name, country)
    if (skipReason) {
      return {
        kind: skipReasonToKind(skipReason),
        isTelecomOperator: false,
        skipReason,
        warnings: [],
      }
    }
  }

  const operatorName = namesToCheck.find((n) => isKnownMobileOperatorName(n, country))
  if (operatorName) {
    return applyFinalOperatorNameValidation(
      {
        kind: 'MOBILE_OPERATOR',
        isTelecomOperator: true,
        skipReason: null,
        warnings: [],
      },
      operatorName,
      country,
    )
  }

  const cleanName = nameForRules(primaryName)
  const words = upperCompact(cleanName).split(' ').filter(Boolean)
  if (
    words.length >= 1 &&
    words.length <= 2 &&
    !/\d/.test(cleanName) &&
    /^[a-zA-Z][a-zA-Z0-9&.\-'\s]*$/.test(cleanName)
  ) {
    return applyFinalOperatorNameValidation(
      {
        kind: 'MOBILE_OPERATOR',
        isTelecomOperator: true,
        skipReason: null,
        warnings: [],
      },
      primaryName,
      country,
    )
  }

  return {
    kind: 'UNKNOWN',
    isTelecomOperator: false,
    skipReason: 'NOT_TELECOM_OPERATOR',
    warnings: [],
  }
}

function skipReasonToKind(reason: SkippedOperatorReason): OperatorRecordKind {
  switch (reason) {
    case 'DATA_PLAN':
      return 'DATA_BUNDLE'
    case 'MOBILE_PLAN':
      return 'MOBILE_PLAN'
    case 'AIRTIME_DENOMINATION':
      return 'AIRTIME'
    case 'PRODUCT_CODE':
      return 'UNKNOWN'
    case 'GIFT_CARD':
      return 'GIFT_CARD'
    case 'DIGITAL_VOUCHER':
      return 'DIGITAL_VOUCHER'
    case 'DTH':
      return 'DTH'
    case 'COMBO_BUNDLE':
      return 'COMBO_BUNDLE'
    case 'BUNDLE_KEYWORD':
    case 'OTT':
      return 'COMBO_BUNDLE'
    case 'UTILITY':
      return 'UTILITY'
    default:
      return 'UNKNOWN'
  }
}

export function formatSkippedOperatorLog(
  name: string,
  countryIso3: string | null | undefined,
  classification: OperatorClassification,
): string {
  const reason = classification.skipReason ?? 'NOT_TELECOM_OPERATOR'
  const displayName = countryIso3
    ? `${stripCountrySuffix(name)} ${countryIso3.toUpperCase()}`
    : stripCountrySuffix(name)
  return `SKIPPED_OPERATOR\n\nName: ${displayName}\nReason: ${reason}`
}

/** @deprecated Use formatSkippedOperatorLog */
export function formatOperatorSyncWarning(name: string, classification: OperatorClassification): string {
  return formatSkippedOperatorLog(name, null, classification)
}

export function isGenuineTelecomOperatorName(name: string, countryIso3?: string | null): boolean {
  const classification = classifyProviderOperatorRecord({
    providerOperatorName: name,
    countryIso3,
  })
  return classification.kind === 'MOBILE_OPERATOR' && classification.isTelecomOperator
}

/** Prefer API operator name, Ding provider map, or humanized provider code over product titles. */
export function resolveTelecomOperatorName(input: {
  plan: NormalizedPlan
  providerOperatorName: string
  providerOperatorId?: string | null
  countryIso3?: string | null
}): string | null {
  const country = input.countryIso3 ?? input.plan.countryIso3
  const candidates: string[] = []

  const raw: Record<string, unknown> =
    input.plan.raw && typeof input.plan.raw === 'object'
      ? (input.plan.raw as Record<string, unknown>)
      : {}

  const rawOperatorName =
    typeof (raw.operator as { name?: string } | undefined)?.name === 'string'
      ? (raw.operator as { name: string }).name.trim()
      : ''
  if (rawOperatorName) candidates.push(rawOperatorName)

  const dingProviderName =
    typeof raw.dingProviderName === 'string'
      ? raw.dingProviderName.trim()
      : typeof raw.providerName === 'string'
        ? raw.providerName.trim()
        : ''
  if (dingProviderName) candidates.push(dingProviderName)

  const fromCode = humanizeProviderCode(input.providerOperatorId ?? '')
  if (fromCode) candidates.push(fromCode)

  const fromRef = humanizeProviderCode(input.plan.operatorRef?.replace(/^[^:]+:/, '') ?? '')
  if (fromRef) candidates.push(fromRef)

  if (input.providerOperatorName) candidates.push(input.providerOperatorName.trim())

  const fromPlan = input.plan.operatorName?.trim()
  if (fromPlan && fromPlan !== input.providerOperatorName) candidates.push(fromPlan)

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = candidate.toLowerCase()
    if (!candidate || seen.has(key)) continue
    seen.add(key)
    if (isGenuineTelecomOperatorName(candidate, country)) return candidate
  }

  return null
}

export function operatorTypeForKind(kind: OperatorRecordKind): string {
  switch (kind) {
    case 'MOBILE_OPERATOR':
      return 'TELECOM'
    case 'GIFT_CARD':
      return 'GIFT_CARD'
    case 'DIGITAL_VOUCHER':
      return 'DIGITAL_VOUCHER'
    case 'DTH':
      return 'DTH'
    case 'UTILITY':
      return 'UTILITY'
    case 'DATA_BUNDLE':
      return 'DATA_BUNDLE'
    case 'COMBO_BUNDLE':
      return 'COMBO_BUNDLE'
    case 'MOBILE_PLAN':
      return 'MOBILE_PLAN'
    case 'AIRTIME':
      return 'AIRTIME'
    default:
      return 'DIGITAL_PRODUCT'
  }
}

/** Legacy aliases */
export function isDenominationOperatorName(name: string): boolean {
  return isAirtimeDenominationName(name)
}

export function isGiftCardOperatorName(name: string): boolean {
  return isGiftCardName(name)
}

export function isVoucherOperatorName(name: string): boolean {
  return /\b(voucher|evoucher)\b/i.test(nameForRules(name))
}
