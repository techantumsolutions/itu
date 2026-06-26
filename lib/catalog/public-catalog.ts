/**
 * Public website catalog — reads only from PostgreSQL via server-side PostgREST.
 * Sources (in order): system_operators/system_plans → internal_plans → legacy operators/plans tables.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { isAggregatorSchemaReady } from '@/lib/aggregator/repository'
import { aggListSystemOperators, aggListSystemPlans } from '@/lib/aggregator/repository'
import { isMobileCatalogOperator, isMobileCatalogPlan } from '@/lib/catalog/mobile-catalog-filter'
import { filterWebsiteEligibleSystemPlans } from '@/lib/catalog/website-plan-eligibility'
import { dbFetchCountries, dbFetchOperators, dbFetchPlans, pickOperatorForPhone } from '@/lib/db/catalog'
import {
  countryDisplayName,
  flagEmojiFromIso,
  normalizeCountryIso3,
  toPublicCountryCode,
  DIAL_CODES,
} from '@/lib/lcr/countries'
import {
  displayPlanName,
  operatorNameFromInternalPlan,
  type InternalPlanRow,
} from '@/lib/lcr/internal-plan-display'
import { countriesList } from '@/lib/country-codes'
import {
  batchLoadInternalPlanRechargeValues,
  derivedDisplayPrices,
  formatPlanRechargeValue,
  type PlanRechargeValue,
} from '@/lib/catalog/plan-recharge-value'
import {
  batchLoadSystemPlanMappedDetails,
  type SystemPlanMappedDetails,
} from '@/lib/catalog/system-plan-mapped-details'
import { englishPlanDisplayFields } from '@/lib/catalog/plan-text-english'

function enc(v: string): string {
  return encodeURIComponent(v)
}

/**
 * In-memory caches built from the countries DB table (all 172+ countries).
 * The hardcoded ISO2_TO_ISO3 in lib/lcr/countries.ts only covers ~35 countries.
 */
let _iso2ToIso3Cache: Map<string, string> | null = null
let _iso3ToIso2Cache: Map<string, string> | null = null

async function buildCountryCache(): Promise<void> {
  if (_iso2ToIso3Cache) return
  try {
    const rows = await dbFetchCountries()
    _iso2ToIso3Cache = new Map<string, string>()
    _iso3ToIso2Cache = new Map<string, string>()
    for (const r of rows) {
      if (r.iso2 && r.iso3) {
        _iso2ToIso3Cache.set(r.iso2.toUpperCase(), r.iso3.toUpperCase())
        _iso3ToIso2Cache.set(r.iso3.toUpperCase(), r.iso2.toUpperCase())
      }
    }
  } catch {
    _iso2ToIso3Cache = new Map()
    _iso3ToIso2Cache = new Map()
  }
}

/** Resolve any ISO2 or ISO3 code to ISO3 using the DB countries table. */
async function resolveIso3FromDb(iso2OrIso3: string): Promise<string> {
  const t = iso2OrIso3.trim().toUpperCase()
  if (!t) return ''
  if (t.length === 3) return t
  await buildCountryCache()
  return _iso2ToIso3Cache!.get(t) ?? normalizeCountryIso3(t) ?? t
}

/** Resolve ISO3 → ISO2 using the DB countries table (covers all 172+ countries). */
async function resolveIso2FromDb(iso3: string): Promise<string> {
  const t = iso3.trim().toUpperCase()
  if (!t) return t
  if (t.length === 2) return t
  await buildCountryCache()
  return _iso3ToIso2Cache!.get(t) ?? toPublicCountryCode(t)
}

export type PublicCountry = {
  code: string
  iso3: string
  name: string
  flag: string
  dialCode: string
  operatorCount?: number
}

export type PublicOperator = {
  id: string
  code: string
  name: string
  shortName: string
  countryCode: string
  countryIso3: string
  logo?: string | null
  validationRegex?: string | null
}

export type PublicPlan = {
  id: string
  internalPlanId?: string
  systemPlanId?: string
  operatorId: string
  /** Customer-facing recharge / face value (destination amount). */
  recharge_amount: number
  recharge_currency: string
  /** Derived for checkout sorting — not shown on plan cards. */
  price_inr: number
  price_eur: number
  validity: string
  data?: string
  benefits: string
  tag: 'popular' | 'none'
  type: 'topup' | 'unlimited' | 'data'
  planName: string
  currency?: string
}

function mapPlanType(
  raw: string | null | undefined,
  planName?: string,
  benefits?: string
): 'topup' | 'unlimited' | 'data' {
  const name = (planName ?? '').toLowerCase()
  const desc = (benefits ?? '').toLowerCase()
  const text = `${name} ${desc}`

  // 1. Unlimited Pack (unlimited calls/voice or combo packs)
  const hasUnlimitedCalls =
    /unlimited\s+(?:local|calls?|voice|minutes|mins|talk)/i.test(text) ||
    /llamadas?\s+(?:locales?\s+)?ilimitadas?/i.test(text) ||
    /minutos\s+(?:de\s+voz\s+)?ilimitados?/i.test(text) ||
    /ilimitad[ao]\s+llamadas?/i.test(text) ||
    /ilimitados?\s+minutos?/i.test(text) ||
    /\bul\s+calls?\b/i.test(text) ||
    /\bul\s+voice\b/i.test(text) ||
    /\bcombo\b/i.test(text) ||
    /std\s+(?:and|y)\s+roaming/i.test(text) ||
    /roaming\s+ilimitado/i.test(text) ||
    /llamadas\s+y\s+sms\s+ilimitados/i.test(text) ||
    /minutos\s+ilimitados/i.test(text) ||
    /habla\s+ilimitado/i.test(text)

  if (hasUnlimitedCalls) return 'unlimited'

  // 2. Data Pack (internet, data, GB, MB, etc. but without unlimited voice)
  const hasData =
    /\b\d+(?:\.\d+)?\s*(?:gb|mb)\b/i.test(text) ||
    /\bdatos\b/i.test(text) ||
    /\bdata\b/i.test(text) ||
    /\binternet\b/i.test(text) ||
    /\bnavegar\b/i.test(text) ||
    /\bnavegaci[oó]n\b/i.test(text) ||
    /\bdatos\s+ilimitados\b/i.test(text) ||
    /\bunlimited\s+data\b/i.test(text) ||
    /\bwhatsapp\b/i.test(text) ||
    /\bfacebook\b/i.test(text) ||
    /\binstagram\b/i.test(text) ||
    /\btiktok\b/i.test(text) ||
    /\bredes\s+sociales\b/i.test(text)

  if (hasData) return 'data'

  // 3. Fallback to database/catalog type if it is specific
  const t = (raw ?? '').toLowerCase()
  if (t.includes('data')) return 'data'
  if (t.includes('voice') || t.includes('unlimited') || t.includes('combo')) return 'unlimited'

  return 'topup'
}

function removeOperatorName(text: string, operatorName: string): string {
  let val = (text ?? '').trim()
  if (!val || !operatorName || operatorName.toLowerCase() === 'unknown') return val

  const escapedOp = operatorName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regex = new RegExp(`\\b${escapedOp}\\b|${escapedOp}`, 'gi')

  let cleaned = val.replace(regex, '')
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-–—/|:.]\s*/, '')
    .replace(/\s*[-–—/|:.]\s*$/, '')
    .trim()

  return cleaned || val
}

function parsePlanSpecs(planName: string, benefits: string): {
  data: string | null
  calls: string | null
  sms: string | null
  validity: string | null
} {
  const text = `${planName} ${benefits}`.toLowerCase()

  // ---- DATA ----
  let data: string | null = null
  if (/\bdatos?\s+ilimitados?|unlimited\s+data/i.test(text)) {
    const throttleM = text.match(/(?:after\s+using\s+|después de usar\s*)([\d.]+\s*gb)/i)
    data = throttleM ? `Unlimited (${throttleM[1].toUpperCase()} FUP)` : 'Unlimited'
  } else {
    const dataM = text.match(/(\d+(?:\.\d+)?\s*(?:gb|mb)(?:\/day|\/día)?)/i)
    if (dataM) data = dataM[1].toUpperCase().replace('DíA', 'Day').replace('DIA', 'Day')
  }

  // ---- CALLS ----
  let calls: string | null = null
  if (/\bul\s+calls?|unlimited\s+(?:local|calls?|voice)|llamadas?\s+(locales?|ilimitadas?)|ilimitad[ao]\s+llamadas?/i.test(text)) {
    calls = 'Unlimited'
  } else if (/std\s+(?:and|y)\s+roaming/i.test(text)) {
    calls = 'Unlimited'
  } else {
    const ttM = text.match(/(?:talktime\s+of|tiempo\s+de\s+conversaci[oó]n\s+de)\s+(?:inr|rs\.?)\s*([\d.]+)/i)
    if (ttM) calls = `₹${ttM[1]} talktime`
  }

  // ---- SMS ----
  let sms: string | null = null
  const smsM = text.match(/(\d+)\s*sms\s*(?:\/day|\/día|per day)?/i)
  if (smsM) sms = `${smsM[1]} SMS`
  else if (/unlimited\s+sms|sms\s+ilimitados?/i.test(text)) sms = 'Unlimited'

  // ---- VALIDITY ----
  let validity: string | null = null
  const dayM = text.match(/(\d+)\s*d[íi]as?\b|(\d+)\s*days?\b|v[aá]lid(?:o|ez)\s+por\s+(\d+)\s*d[íi]as?/i)
  if (dayM) {
    const days = parseInt(dayM[1] ?? dayM[2] ?? dayM[3] ?? '0', 10)
    validity = days === 1 ? '1 Day' : `${days} Days`
  }

  return { data, calls, sms, validity }
}

function elaboratePlanDescription(
  plan: PublicPlan,
  countryCodeIso2: string,
  specs: ReturnType<typeof parsePlanSpecs>
): string {
  const currentDesc = (plan.benefits ?? '').trim()
  const isTooSmall = !currentDesc || currentDesc.length <= 15 || currentDesc.toLowerCase() === (plan.planName ?? '').toLowerCase()

  if (!isTooSmall) {
    return currentDesc
  }

  const rechargeLabel = formatPlanRechargeValue(plan.recharge_amount, plan.recharge_currency)

  const commonCurrencies: Record<string, string> = {
    IN: 'INR (₹)',
    US: 'USD ($)',
    GB: 'GBP (£)',
    MX: 'MXN ($)',
    NG: 'NGN (₦)',
    GH: 'GHS (GH₵)',
    KE: 'KES (KSh)',
    JM: 'JMD (J$)',
    PH: 'PHP (₱)',
    BD: 'BDT (৳)',
    PK: 'PKR (₨)',
    LK: 'LKR (₨)',
    NP: 'NPR (₨)',
    AE: 'AED',
    SA: 'SAR (SR)',
    EG: 'EGP',
    TR: 'TRY (₺)',
    BR: 'BRL (R$)',
    CO: 'COP (Col$)',
    CA: 'CAD (C$)',
    AU: 'AUD (A$)',
    ZA: 'ZAR (R)',
    ID: 'IDR (Rp)',
    MY: 'MYR (RM)',
    SG: 'SGD (S$)',
    TH: 'THB (฿)',
    VN: 'VND (₫)',
  }
  const countryUpper = countryCodeIso2.toUpperCase()
  const localCurrency = commonCurrencies[countryUpper] || 'the local currency'

  const numMatch = currentDesc.match(/[\d.,]+/) || (plan.planName ?? '').match(/[\d.,]+/)
  const extractedValue = numMatch ? numMatch[0] : null
  const localValueText = extractedValue 
    ? `${extractedValue} in ${localCurrency}` 
    : `the local currency equivalent`

  if (plan.type === 'topup') {
    const talktimeAmt = specs.calls && specs.calls !== 'Unlimited' ? specs.calls : rechargeLabel
    const baseDesc = currentDesc ? ` (${currentDesc})` : ''
    return `Instant airtime top-up plan${baseDesc}. This plan delivers standard talktime credit of approximately ${localValueText}, valued at ${rechargeLabel}. Perfect for making local/international calls, sending SMS, or using mobile data at standard operator base tariffs.`
  }

  if (plan.type === 'data') {
    const dataAmt = plan.data || specs.data || 'high-speed'
    const validityText = plan.validity && plan.validity !== 'No Expiry' ? `for ${plan.validity}` : 'with standard validity'
    const baseDesc = currentDesc ? ` (${currentDesc})` : ''
    return `High-speed internet mobile data pack${baseDesc}. Provides ${dataAmt} data capacity ${validityText}, priced at ${rechargeLabel}, suitable for ${localValueText}. Ideal for internet browsing, streaming video, downloading files, and social media connectivity.`
  }

  return currentDesc
}


function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

async function loadSystemOperatorNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!ids.length) return map
  const res = await supabaseRest(
    `system_operators?id=in.(${ids.map(enc).join(',')})&select=id,system_operator_name&limit=${ids.length}`,
    { cache: 'no-store' },
  ).catch(() => null)

  if (!res?.ok) return map
  const rows = (await res.json()) as { id: string; system_operator_name?: string }[]
  console.log("operators in system operator table")
  for (const row of rows) {
    if (row.id && row.system_operator_name) map.set(row.id, row.system_operator_name)
  }
  return map
}

async function listCountriesFromInternalPlans(): Promise<PublicCountry[]> {
  const counts = new Map<string, number>()
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const res = await supabaseRest(
      `internal_plans?active=eq.true&select=country_iso3&order=country_iso3.asc&limit=1000&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      hasMore = false
      break
    }
    const rows = (await res.json()) as { country_iso3: string }[]
    if (!rows || !rows.length) {
      hasMore = false
      break
    }
    for (const row of rows) {
      const c = (row.country_iso3 ?? '').toUpperCase()
      if (!c) continue
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    if (rows.length < 1000) {
      hasMore = false
    } else {
      offset += 1000
    }
  }

  return [...counts.entries()]
    .sort((a, b) => countryDisplayName(a[0]).localeCompare(countryDisplayName(b[0])))
    .map(([iso3, planCount]) => ({
      iso3,
      code: toPublicCountryCode(iso3),
      name: countryDisplayName(iso3),
      flag: flagEmojiFromIso(iso3),
      dialCode: DIAL_CODES[iso3] ?? '',
      operatorCount: planCount,
    }))
}

async function listCountriesFromSystemOperators(): Promise<PublicCountry[]> {
  const counts = new Map<string, number>()
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const rows = (await aggListSystemOperators({ limit: 1000, offset, mobileCatalogOnly: true })) as Array<{
      country_id: string
    }>
    if (!rows || !rows.length) {
      hasMore = false
      break
    }
    for (const row of rows) {
      const c = (row.country_id ?? '').toUpperCase()
      if (!c) continue
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    if (rows.length < 1000) {
      hasMore = false
    } else {
      offset += 1000
    }
  }

  console.log("rows of list of countries from system operator")
  return [...counts.entries()]
    .sort((a, b) => countryDisplayName(a[0]).localeCompare(countryDisplayName(b[0])))
    .map(([iso3, operatorCount]) => ({
      iso3,
      code: toPublicCountryCode(iso3),
      name: countryDisplayName(iso3),
      flag: flagEmojiFromIso(iso3),
      dialCode: DIAL_CODES[iso3] ?? '',
      operatorCount,
    }))
}

export async function fetchPublicCountries(): Promise<PublicCountry[]> {
  try {
    const dbCountries = await dbFetchCountries()
    return dbCountries.map((c) => ({
      code: c.iso2,
      iso3: c.iso3,
      name: c.name,
      flag: flagEmojiFromIso(c.iso2),
      dialCode: c.dial_prefix || DIAL_CODES[c.iso3] || '',
    }))
  } catch (error) {
    console.error('Failed to fetch public countries:', error)
    return []
  }
}

async function listOperatorsFromInternalPlans(countryIso3: string): Promise<PublicOperator[]> {
  const res = await supabaseRest(
    `internal_plans?active=eq.true&country_iso3=eq.${enc(countryIso3)}&select=id,country_iso3,operator_ref,uti_plan_name,raw_response&order=operator_ref.asc&limit=5000`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as InternalPlanRow[]
  const systemIds = rows
    .map((r) => (r.operator_ref?.startsWith('system:') ? r.operator_ref.slice(7) : ''))
    .filter(Boolean)
  const systemNames = await loadSystemOperatorNames(systemIds)

  const byRef = new Map<string, PublicOperator>()
  for (const row of rows) {
    const ref = row.operator_ref?.trim()
    if (!ref || byRef.has(ref)) continue
    const name = operatorNameFromInternalPlan(row, systemNames)
    byRef.set(ref, {
      id: ref,
      code: ref,
      name,
      shortName: name,
      countryCode: toPublicCountryCode(countryIso3),
      countryIso3,
    })
  }
  return [...byRef.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchPublicOperators(countryInput: string): Promise<PublicOperator[]> {
  // Use DB-backed resolver to correctly convert ISO2 → ISO3 for all countries (not just the 35 hardcoded ones)
  const countryIso3 = await resolveIso3FromDb(countryInput)
  if (!countryIso3) return []

  if (await isAggregatorSchemaReady()) {
    const rows = (await aggListSystemOperators({
      country: countryIso3,
      limit: 500,
      offset: 0,
      mobileCatalogOnly: true,
    })) as Array<{
      id: string
      system_operator_name: string
      country_id: string
      slug?: string
      logo?: string | null
      service_domain?: string | null
      status?: string | null
    }>
    return await Promise.all(
      rows
        .filter((row) => isMobileCatalogOperator(row))
        .map(async (row) => ({
          id: row.id,
          code: row.id,
          name: row.system_operator_name,
          shortName: row.system_operator_name,
          countryCode: await resolveIso2FromDb(row.country_id),
          countryIso3: row.country_id,
          logo: row.logo ?? null,
        }))
    )
  }

  try {
    const iso2 = await resolveIso2FromDb(countryIso3)
    const legacy = await dbFetchOperators(iso2.length === 2 ? iso2 : countryInput.toUpperCase())
    return legacy.map((p) => ({
      id: p.code,
      code: p.code,
      name: p.name,
      shortName: p.short_name ?? p.name,
      countryCode: p.country_iso,
      countryIso3,
      logo: p.logo_url,
      validationRegex: p.validation_regex,
    }))
  } catch {
    return []
  }
}

function systemPlanToPublic(
  row: Record<string, unknown>,
  operatorId: string,
  mapped: SystemPlanMappedDetails,
): PublicPlan {
  const recharge = mapped.recharge
  const { price_inr: priceInr, price_eur: priceEur } = derivedDisplayPrices(
    recharge.amount,
    recharge.currency,
  )
  const planTypeRaw = mapped.planType ?? row.plan_type ?? row.category ?? 'topup'
  const planName = mapped.planName || String(row.system_plan_name ?? 'Plan')
  const benefits = mapped.description || String(row.description ?? row.system_plan_name ?? '')
  return {
    id: String(row.id),
    systemPlanId: String(row.id),
    internalPlanId: row.internal_plan_id != null ? String(row.internal_plan_id) : undefined,
    operatorId,
    recharge_amount: recharge.amount,
    recharge_currency: recharge.currency,
    price_inr: priceInr,
    price_eur: priceEur,
    validity: mapped.validity || String(row.validity ?? ''),
    data: mapped.dataVolume ?? (row.data_volume != null ? String(row.data_volume) : undefined),
    benefits,
    tag: 'none',
    type: mapPlanType(String(planTypeRaw), planName, benefits),
    planName,
    currency: recharge.currency,
  }
}

function internalPlanToPublic(
  row: InternalPlanRow,
  operatorRef: string,
  recharge: PlanRechargeValue,
  idx: number,
): PublicPlan {
  const { price_inr: priceInr, price_eur: priceEur } = derivedDisplayPrices(
    recharge.amount,
    recharge.currency,
  )
  const name = displayPlanName(row)
  const benefits = row.uti_description ?? name
  return {
    id: row.id,
    internalPlanId: row.id,
    operatorId: operatorRef,
    recharge_amount: recharge.amount,
    recharge_currency: recharge.currency,
    price_inr: priceInr,
    price_eur: priceEur,
    validity: row.subservice ?? '',
    benefits,
    tag: idx < 3 ? 'popular' : 'none',
    type: mapPlanType(row.category, name, benefits),
    planName: name,
    currency: recharge.currency,
  }
}

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase()
}

function operatorNameMatches(candidate: string, needle: string): boolean {
  const c = normalizeSearch(candidate)
  const n = normalizeSearch(needle)
  if (!c || !n) return false
  if (c.includes(n) || n.includes(c)) return true
  const cFirst = c.split(/\s+/)[0] ?? ''
  const nFirst = n.split(/\s+/)[0] ?? ''
  return cFirst.length > 2 && nFirst.length > 2 && cFirst === nFirst
}

export async function resolvePublicOperatorKey(
  countryInput: string,
  input: { operatorId?: string; operatorName?: string },
): Promise<{ id: string; name: string } | null> {
  const operators = await fetchPublicOperators(countryInput)
  const id = (input.operatorId ?? '').trim()
  if (id) {
    const hit = operators.find((o) => o.id === id || o.code === id)
    if (hit) return { id: hit.code, name: hit.name }
  }
  const name = (input.operatorName ?? '').trim()
  if (name && name.toLowerCase() !== 'unknown') {
    const hit = operators.find((o) => operatorNameMatches(o.name, name) || operatorNameMatches(o.shortName, name))
    if (hit) return { id: hit.code, name: hit.name }
  }
  return null
}

async function listPlansFromInternalPlansByName(countryIso3: string, operatorName: string): Promise<PublicPlan[]> {
  const res = await supabaseRest(
    `internal_plans?active=eq.true&country_iso3=eq.${enc(countryIso3)}&select=*&order=uti_plan_name.asc&limit=500`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as InternalPlanRow[]
  const systemIds = rows
    .map((r) => (r.operator_ref?.startsWith('system:') ? r.operator_ref.slice(7) : ''))
    .filter(Boolean)
  const systemNames = await loadSystemOperatorNames(systemIds)
  const matched = rows.filter((row) => operatorNameMatches(operatorNameFromInternalPlan(row, systemNames), operatorName))
  if (!matched.length) return []

  const rechargeMap = await batchLoadInternalPlanRechargeValues(matched.map((r) => r.id))
  return matched
    .map((row, idx) => {
      const recharge = rechargeMap.get(row.id)
      if (!recharge) return null
      return internalPlanToPublic(row, row.operator_ref, recharge, idx)
    })
    .filter((p): p is PublicPlan => p != null)
}

function applyPlanFilters(
  plans: PublicPlan[],
  filters: { search?: string; category?: string },
): PublicPlan[] {
  let rows = [...plans]
  const category = (filters.category ?? '').trim().toLowerCase()
  if (category && category !== 'all') {
    if (category === 'popular') {
      rows = rows.filter((p) => p.tag === 'popular')
    } else if (category === 'voice' || category === 'sms' || category === 'bundles') {
      rows = rows.filter((p) => p.type === 'unlimited' || p.type === 'topup')
    } else {
      rows = rows.filter((p) => p.type === category || mapPlanType(p.type, p.planName, p.benefits) === category)
    }
  }
  const search = (filters.search ?? '').trim().toLowerCase()
  if (search) {
    rows = rows.filter(
      (p) =>
        p.planName.toLowerCase().includes(search) ||
        p.benefits.toLowerCase().includes(search) ||
        String(p.price_inr).includes(search),
    )
  }
  return rows
}

async function listPlansFromInternalPlans(countryIso3: string, operatorRef: string): Promise<PublicPlan[]> {
  const res = await supabaseRest(
    `internal_plans?active=eq.true&country_iso3=eq.${enc(countryIso3)}&operator_ref=eq.${enc(operatorRef)}&select=*&order=uti_plan_name.asc&limit=500`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as InternalPlanRow[]
  const rechargeMap = await batchLoadInternalPlanRechargeValues(rows.map((r) => r.id))
  return rows
    .map((row, idx) => {
      const recharge = rechargeMap.get(row.id)
      if (!recharge) return null
      return internalPlanToPublic(row, operatorRef, recharge, idx)
    })
    .filter((p): p is PublicPlan => p != null)
}

export async function fetchPublicPlans(input: {
  countryCode?: string
  countryId?: string
  operatorId?: string
  operatorRef?: string
  operatorName?: string
  search?: string
  category?: string
  limit?: number
}): Promise<PublicPlan[]> {
  const countryIso3 = await resolveIso3FromDb(input.countryId ?? input.countryCode ?? '')
  const limit = input.limit ?? 200

  const resolved = await resolvePublicOperatorKey(input.countryId ?? input.countryCode ?? '', {
    operatorId: input.operatorId ?? input.operatorRef,
    operatorName: input.operatorName,
  })
  const operatorId = resolved?.id ?? (input.operatorId ?? input.operatorRef ?? '').trim()
  const operatorName = resolved?.name ?? input.operatorName?.trim()

  if (!operatorId && !operatorName) return []

  const countryForOps = input.countryId ?? input.countryCode ?? ''
  const mobileOperators = countryForOps ? await fetchPublicOperators(countryForOps) : []
  const operatorAllowed =
    !mobileOperators.length ||
    mobileOperators.some(
      (o) =>
        (operatorId && (o.id === operatorId || o.code === operatorId)) ||
        (operatorName && operatorNameMatches(o.name, operatorName)),
    )

  if ((await isAggregatorSchemaReady()) && mobileOperators.length > 0 && !operatorAllowed) {
    return []
  }

  let plans: PublicPlan[] = []

  if (operatorId && (await isAggregatorSchemaReady())) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(operatorId)
    if (isUuid) {
      const rows = (await aggListSystemPlans({
        systemOperatorId: operatorId,
        q: input.search,
        limit,
        offset: 0,
        mobileCatalogOnly: true,
      })) as Record<string, unknown>[]
      const activeMobilePlans = rows.filter((row) => isMobileCatalogPlan(row as { status?: string; service_domain?: string }))
      const eligibleRows = await filterWebsiteEligibleSystemPlans(activeMobilePlans, operatorId)
      if (eligibleRows.length) {
        const mappedDetails = await batchLoadSystemPlanMappedDetails(
          eligibleRows.map((r) => String(r.id)),
        )
        plans = eligibleRows
          .map((r) => {
            const mapped = mappedDetails.get(String(r.id))
            if (!mapped) return null
            return systemPlanToPublic(r, operatorId, mapped)
          })
          .filter((p): p is PublicPlan => p != null)
      }
    }
  }

  if (!plans.length && countryIso3 && operatorId && !(await isAggregatorSchemaReady())) {
    plans = await listPlansFromInternalPlans(countryIso3, operatorId)
  }

  if (!plans.length && countryIso3 && operatorName && !(await isAggregatorSchemaReady())) {
    plans = await listPlansFromInternalPlansByName(countryIso3, operatorName)
  }

  if (!plans.length && operatorId && !(await isAggregatorSchemaReady())) {
    try {
      const iso2 = countryIso3 ? toPublicCountryCode(countryIso3) : (input.countryCode ?? 'IN')
      const legacy = await dbFetchPlans(iso2, operatorId)
      plans = legacy.map((p) => {
        const amount = num(p.price_inr) > 0 ? num(p.price_inr) : num(p.price_eur)
        const currency = num(p.price_inr) > 0 ? 'INR' : 'EUR'
        return {
          id: p.sku_code,
          internalPlanId: p.sku_code,
          operatorId,
          recharge_amount: amount,
          recharge_currency: currency,
          price_inr: Math.round(num(p.price_inr)),
          price_eur: Number(num(p.price_eur).toFixed(2)),
          validity: p.validity ?? '',
          data: p.data_label ?? undefined,
          benefits: p.benefits ?? '',
          tag: p.tag === 'popular' ? ('popular' as const) : ('none' as const),
          type: mapPlanType(p.plan_type, p.plan_name ?? p.sku_code, p.benefits ?? ''),
          planName: p.plan_name ?? p.sku_code,
          currency,
        }
      })
    } catch {
      plans = []
    }
  }

  if (plans.length > 0) {
    const activeOperatorName = operatorName || ''
    const countryIso2 = countryIso3 ? await resolveIso2FromDb(countryIso3) : (input.countryCode || 'IN')
    plans = await Promise.all(plans.map(async (p) => {
      const english = englishPlanDisplayFields({
        planName: p.planName,
        benefits: p.benefits,
        validity: p.validity,
      })
      const resolvedType = p.type || mapPlanType(p.type, english.planName, english.benefits)
      const cleanName = removeOperatorName(english.planName, activeOperatorName)
      const cleanBenefits = removeOperatorName(english.benefits, activeOperatorName)
      const specs = parsePlanSpecs(cleanName, cleanBenefits)

      const vNum = parseInt(english.validity, 10)
      const validityVal = resolvedType === 'topup'
        ? 'Life Time'
        : (Number.isFinite(vNum) && vNum <= 0) ? 'No Expiry' : (english.validity || p.validity)

      const elaboratedBenefits = elaboratePlanDescription(
        { ...p, planName: cleanName, benefits: cleanBenefits, type: resolvedType, validity: validityVal },
        countryIso2,
        specs
      )

      return {
        ...p,
        planName: cleanName,
        benefits: elaboratedBenefits,
        validity: validityVal,
        type: resolvedType,
      }
    }))
  }

  return applyPlanFilters(plans, { search: input.search, category: input.category }).slice(0, limit)
}

export async function detectPublicOperator(input: {
  phoneNumber: string
  countryCode: string
}): Promise<{ operator: string; providerCode?: string; country: string; source: string }> {
  const dbCountries = await dbFetchCountries().catch(() => [])
  const digits = input.phoneNumber.replace(/\D/g, '')

  // Build prefix map: use countries.dial_prefix from DB as primary source of truth.
  // Fall back to countriesList (libphonenumber-js) only for rows where DB dial_prefix is missing.
  const fallbackMap = new Map<string, string>()
  for (const item of countriesList) {
    fallbackMap.set(item.code.toUpperCase(), item.dialCode.replace('+', '').trim())
  }

  const prefixMap = new Map<string, string>()
  for (const c of dbCountries) {
    const iso2 = c.iso2.toUpperCase()
    const dbPrefix = (c.dial_prefix ?? '').replace('+', '').trim()
    const prefix = dbPrefix || fallbackMap.get(iso2) || ''
    if (prefix) prefixMap.set(iso2, prefix)
  }

  let matchedCountry = null
  if (digits) {
    // Sort countries by prefix length descending to match longest first (e.g. 502 before 5)
    const sorted = [...dbCountries].sort((a, b) => {
      const prefixA = prefixMap.get(a.iso2.toUpperCase()) || ''
      const prefixB = prefixMap.get(b.iso2.toUpperCase()) || ''
      return prefixB.length - prefixA.length
    })

    for (const c of sorted) {
      const prefix = prefixMap.get(c.iso2.toUpperCase())
      if (prefix && digits.startsWith(prefix)) {
        if (digits.length >= prefix.length + 4) {
          matchedCountry = c
          break
        }
      }
    }
  }

  const verifiedCountryCode = matchedCountry ? matchedCountry.iso2.toUpperCase() : input.countryCode.toUpperCase()

  const operators = await fetchPublicOperators(verifiedCountryCode)
  const legacyShape = operators.map((o) => ({
    country_iso: o.countryCode,
    code: o.code,
    name: o.name,
    short_name: o.shortName,
    logo_url: o.logo ?? null,
    validation_regex: o.validationRegex ?? null,
    region_code: null as string | null,
    is_default: null as boolean | null,
  }))

  let picked = null
  if (matchedCountry) {
    const prefix = prefixMap.get(matchedCountry.iso2.toUpperCase()) || ''
    const nationalDigits = prefix && digits.startsWith(prefix) ? digits.slice(prefix.length) : digits
    picked = pickOperatorForPhone(legacyShape, nationalDigits) || pickOperatorForPhone(legacyShape, digits)
  } else {
    picked = pickOperatorForPhone(legacyShape, digits)
  }

  if (picked) {
    return {
      operator: (picked.short_name ?? picked.name).trim(),
      providerCode: picked.code,
      country: verifiedCountryCode,
      source: 'database',
    }
  }
  const defaultOp = legacyShape.find((o) => o.is_default === true)
  if (defaultOp) {
    return {
      operator: (defaultOp.short_name ?? defaultOp.name).trim(),
      providerCode: defaultOp.code,
      country: verifiedCountryCode,
      source: 'database',
    }
  }
  if (operators.length === 1) {
    const o = operators[0]!
    return {
      operator: o.shortName,
      providerCode: o.code,
      country: verifiedCountryCode,
      source: 'database',
    }
  }
  return {
    operator: 'Unknown',
    providerCode: undefined,
    country: verifiedCountryCode,
    source: 'database',
  }
}

export async function fetchPublicOperatorCounts(): Promise<Record<string, number>> {
  const countries = await fetchPublicCountries()
  const out: Record<string, number> = {}
  for (const c of countries) {
    out[c.code.toUpperCase()] = c.operatorCount ?? 0
    out[c.iso3.toUpperCase()] = c.operatorCount ?? 0
  }
  if (Object.keys(out).length) return out

  if (await isAggregatorSchemaReady()) {
    const rows = (await aggListSystemOperators({ limit: 5000, offset: 0, mobileCatalogOnly: true })) as Array<{ country_id: string }>
    for (const row of rows) {
      const iso3 = (row.country_id ?? '').toUpperCase()
      const iso2 = toPublicCountryCode(iso3)
      out[iso3] = (out[iso3] ?? 0) + 1
      out[iso2] = (out[iso2] ?? 0) + 1
    }
  }
  return out
}
