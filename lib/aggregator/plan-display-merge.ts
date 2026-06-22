import { ISO3_TO_ISO2 } from '@/lib/lcr/countries'
import { countryConfig } from '@/lib/locale/country-config'

/** ISO2 / ISO3 → local retail currency used in plan display names. */
const COUNTRY_LOCAL_CURRENCY: Record<string, string> = {
  IN: 'INR',
  IND: 'INR',
  US: 'USD',
  USA: 'USD',
  GB: 'GBP',
  GBR: 'GBP',
  NG: 'NGN',
  NGA: 'NGN',
  GH: 'GHS',
  GHA: 'GHS',
  KE: 'KES',
  KEN: 'KES',
  JM: 'JMD',
  JAM: 'JMD',
  MX: 'MXN',
  MEX: 'MXN',
  PH: 'PHP',
  PHL: 'PHP',
  PK: 'PKR',
  PAK: 'PKR',
  BD: 'BDT',
  BGD: 'BDT',
  LK: 'LKR',
  LKA: 'LKR',
  NP: 'NPR',
  NPL: 'NPR',
  AE: 'AED',
  ARE: 'AED',
  SA: 'SAR',
  SAU: 'SAR',
  BR: 'BRL',
  BRA: 'BRL',
  CO: 'COP',
  COL: 'COP',
  CA: 'CAD',
  CAN: 'CAD',
  AU: 'AUD',
  AUS: 'AUD',
  ZA: 'ZAR',
  ZAF: 'ZAR',
  EG: 'EGP',
  EGY: 'EGP',
  TR: 'TRY',
  TUR: 'TRY',
  ID: 'IDR',
  IDN: 'IDR',
  MY: 'MYR',
  MYS: 'MYR',
  SG: 'SGD',
  SGP: 'SGD',
  TH: 'THB',
  THA: 'THB',
  VN: 'VND',
  VNM: 'VND',
}

const CURRENCY_SYMBOL: Record<string, string> = {
  '₹': 'INR',
  '₨': 'INR',
  '৳': 'BDT',
  '₦': 'NGN',
  '₱': 'PHP',
  '₫': 'VND',
  '฿': 'THB',
}

/** Provider/settlement currencies — ignored when a local retail price is present in the name. */
const FOREIGN_DISPLAY_CURRENCIES = new Set(['EUR', 'USD', 'GBP'])

const CURRENCY_BEFORE_AMOUNT =
  /\b([A-Z]{3})\s*([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b/gi
const AMOUNT_BEFORE_CURRENCY =
  /\b([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*([A-Z]{3})\b/gi
const SYMBOL_AMOUNT = /([₹₨৳₦₱₫฿])\s*([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/g

export type DisplayPriceMention = { amount: number; currency: string }

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/[,\s]/g, '')
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function normalizeDisplayAmount(amount: number): string {
  return String(Number(amount.toFixed(2)))
}

export function resolveLocalCurrencyForCountry(countryCode: string | null | undefined): string | null {
  const cc = String(countryCode ?? '')
    .trim()
    .toUpperCase()
  if (!cc) return null

  if (COUNTRY_LOCAL_CURRENCY[cc]) return COUNTRY_LOCAL_CURRENCY[cc]

  if (cc.length === 3) {
    const iso2 = ISO3_TO_ISO2[cc]
    if (iso2 && countryConfig[iso2 as keyof typeof countryConfig]) {
      return countryConfig[iso2 as keyof typeof countryConfig].currency
    }
  }

  if (cc.length === 2) {
    const iso3 = Object.entries(ISO3_TO_ISO2).find(([, a2]) => a2 === cc)?.[0]
    if (iso3 && COUNTRY_LOCAL_CURRENCY[iso3]) return COUNTRY_LOCAL_CURRENCY[iso3]
  }

  return null
}

export function extractPriceMentionsFromName(name: string): DisplayPriceMention[] {
  const mentions: DisplayPriceMention[] = []
  const seen = new Set<string>()

  const push = (amountRaw: string, currencyRaw: string) => {
    const amount = parseAmount(amountRaw)
    const currency = currencyRaw.trim().toUpperCase()
    if (!amount || !currency) return
    const key = `${currency}:${normalizeDisplayAmount(amount)}`
    if (seen.has(key)) return
    seen.add(key)
    mentions.push({ amount, currency })
  }

  for (const match of name.matchAll(CURRENCY_BEFORE_AMOUNT)) {
    push(match[2], match[1])
  }
  for (const match of name.matchAll(AMOUNT_BEFORE_CURRENCY)) {
    push(match[1], match[2])
  }
  for (const match of name.matchAll(SYMBOL_AMOUNT)) {
    const currency = CURRENCY_SYMBOL[match[1]]
    if (currency) push(match[2], currency)
  }

  return mentions
}

/** Local retail price embedded in a plan display name (ignores EUR/USD when local currency is present). */
export function extractDisplayPriceFromName(
  name: string | null | undefined,
  countryCode: string | null | undefined,
): DisplayPriceMention | null {
  const text = String(name ?? '').trim()
  if (!text) return null

  const localCurrency = resolveLocalCurrencyForCountry(countryCode)
  if (!localCurrency) return null

  const mentions = extractPriceMentionsFromName(text)
  const localMentions = mentions.filter((m) => m.currency === localCurrency)
  if (localMentions.length > 0) {
    return localMentions[0]
  }

  const nonForeign = mentions.filter((m) => !FOREIGN_DISPLAY_CURRENCIES.has(m.currency))
  return nonForeign[0] ?? null
}

export function buildPlanFeatureKey(plan: {
  validity?: string | null
  data_volume?: string | null
  sms?: string | null
  talktime?: string | null
  plan_type?: string | null
}): string {
  const norm = (value: unknown) =>
    String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ')

  return [
    norm(plan.validity),
    norm(plan.data_volume),
    norm(plan.sms),
    norm(plan.talktime),
    norm(plan.plan_type),
  ].join('|')
}

export function hasComparablePlanFeatures(featureKey: string): boolean {
  return featureKey.split('|').some((part) => part.length > 0)
}

export function buildEquivalentPlanMergeKey(input: {
  countryCode: string
  systemOperatorId: string
  featureKey: string
  displayPrice: DisplayPriceMention
}): string {
  const country = input.countryCode.trim().toUpperCase() || 'UNK'
  const amount = normalizeDisplayAmount(input.displayPrice.amount)
  const currency = input.displayPrice.currency.trim().toUpperCase()
  return `${country}:${input.systemOperatorId}:${input.featureKey}:${currency}:${amount}`
}

export type SystemPlanMergeRow = {
  id: string
  system_operator_id?: string | null
  system_plan_name?: string | null
  country_code?: string | null
  amount?: number | null
  currency?: string | null
  validity?: string | null
  data_volume?: string | null
  sms?: string | null
  talktime?: string | null
  plan_type?: string | null
  normalized_signature?: string | null
  status?: string | null
  created_at?: string | null
  internal_plan_id?: string | null
}

function normalizePlanDisplayName(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function normalizePlanAmountKey(amount: number | null | undefined): string {
  const value = Number(amount ?? 0)
  if (!Number.isFinite(value)) return '0'
  return String(Number(value.toFixed(4)))
}

/**
 * Group plans with the same country, operator, display name, amount, and currency.
 * Catches duplicates that differ only by normalized_signature or sparse feature columns.
 */
export function groupPlansByDisplayName(plans: SystemPlanMergeRow[]): Map<string, SystemPlanMergeRow[]> {
  const groups = new Map<string, SystemPlanMergeRow[]>()

  for (const plan of plans) {
    const operatorId = String(plan.system_operator_id ?? '').trim()
    const countryCode = (String(plan.country_code ?? 'UNK').trim().toUpperCase()) || 'UNK'
    const name = normalizePlanDisplayName(plan.system_plan_name)
    if (!operatorId || !name) continue

    const amount = normalizePlanAmountKey(plan.amount)
    const currency = String(plan.currency ?? '').trim().toUpperCase() || 'UNK'
    const key = `${countryCode}:${operatorId}:${name}:${amount}:${currency}`
    if (!groups.has(key)) groups.set(key, [])
    const bucket = groups.get(key)!
    if (!bucket.some((row) => row.id === plan.id)) bucket.push(plan)
  }

  return groups
}

export function groupEquivalentDisplayPlans(plans: SystemPlanMergeRow[]): Map<string, SystemPlanMergeRow[]> {
  const groups = new Map<string, SystemPlanMergeRow[]>()

  for (const plan of plans) {
    const operatorId = String(plan.system_operator_id ?? '').trim()
    const countryCode = (String(plan.country_code ?? 'UNK').trim().toUpperCase()) || 'UNK'
    if (!operatorId) continue

    const featureKey = buildPlanFeatureKey(plan)
    if (!hasComparablePlanFeatures(featureKey)) continue

    const displayPrice = extractDisplayPriceFromName(plan.system_plan_name, countryCode)
    if (!displayPrice) continue

    const key = buildEquivalentPlanMergeKey({
      countryCode,
      systemOperatorId: operatorId,
      featureKey,
      displayPrice,
    })
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(plan)
  }

  return groups
}

export function pickMergeTargetPlan(plans: SystemPlanMergeRow[]): SystemPlanMergeRow | null {
  if (plans.length < 2) return null

  const sorted = [...plans].sort((a, b) => {
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1
    if (Boolean(a.internal_plan_id) !== Boolean(b.internal_plan_id)) {
      return a.internal_plan_id ? -1 : 1
    }
    const aName = String(a.system_plan_name ?? '').length
    const bName = String(b.system_plan_name ?? '').length
    if (aName !== bName) return aName - bName
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })

  return sorted[0] ?? null
}

/** Auto-merge canonical: keep the oldest system_plan record. */
export function pickCanonicalMergeTargetPlan(plans: SystemPlanMergeRow[]): SystemPlanMergeRow | null {
  if (plans.length < 2) return null

  const sorted = [...plans].sort((a, b) => {
    const created = String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    if (created !== 0) return created
    return String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })

  return sorted[0] ?? null
}
