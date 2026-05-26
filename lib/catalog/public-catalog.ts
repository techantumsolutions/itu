/**
 * Public website catalog — reads only from PostgreSQL via server-side PostgREST.
 * Sources (in order): system_operators/system_plans → internal_plans → legacy operators/plans tables.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { isAggregatorSchemaReady } from '@/lib/aggregator/repository'
import { aggListSystemOperators, aggListSystemPlans } from '@/lib/aggregator/repository'
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

function enc(v: string): string {
  return encodeURIComponent(v)
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

function mapPlanType(raw: string | null | undefined): 'topup' | 'unlimited' | 'data' {
  const t = (raw ?? 'topup').toLowerCase()
  if (t.includes('data')) return 'data'
  if (t.includes('voice') || t.includes('unlimited') || t.includes('combo')) return 'unlimited'
  return 'topup'
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
  for (const row of rows) {
    if (row.id && row.system_operator_name) map.set(row.id, row.system_operator_name)
  }
  return map
}

async function listCountriesFromInternalPlans(): Promise<PublicCountry[]> {
  const res = await supabaseRest(
    'internal_plans?active=eq.true&select=country_iso3&order=country_iso3.asc&limit=5000',
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as { country_iso3: string }[]
  const counts = new Map<string, number>()
  for (const row of rows) {
    const c = (row.country_iso3 ?? '').toUpperCase()
    if (!c) continue
    counts.set(c, (counts.get(c) ?? 0) + 1)
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
  const rows = (await aggListSystemOperators({ limit: 2000, offset: 0 })) as Array<{
    country_id: string
  }>
  const counts = new Map<string, number>()
  for (const row of rows) {
    const c = (row.country_id ?? '').toUpperCase()
    if (!c) continue
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
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
  if (await isAggregatorSchemaReady()) {
    const fromSystem = await listCountriesFromSystemOperators()
    if (fromSystem.length) return fromSystem
  }

  const fromInternal = await listCountriesFromInternalPlans()
  if (fromInternal.length) return fromInternal

  try {
    const legacy = await dbFetchCountries()
    return legacy.map((c) => {
      const iso3 = normalizeCountryIso3(c.country_iso)
      return {
        code: c.country_iso,
        iso3,
        name: c.name,
        flag: flagEmojiFromIso(c.country_iso),
        dialCode: c.dial_prefix ?? DIAL_CODES[iso3] ?? '',
      }
    })
  } catch {
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
  const countryIso3 = normalizeCountryIso3(countryInput)
  if (!countryIso3) return []

  if (await isAggregatorSchemaReady()) {
    const rows = (await aggListSystemOperators({ country: countryIso3, limit: 500, offset: 0 })) as Array<{
      id: string
      system_operator_name: string
      country_id: string
      slug?: string
      logo?: string | null
    }>
    if (rows.length) {
      return rows.map((row) => ({
        id: row.id,
        code: row.id,
        name: row.system_operator_name,
        shortName: row.system_operator_name,
        countryCode: toPublicCountryCode(row.country_id),
        countryIso3: row.country_id,
        logo: row.logo ?? null,
      }))
    }
  }

  const fromInternal = await listOperatorsFromInternalPlans(countryIso3)
  if (fromInternal.length) return fromInternal

  try {
    const iso2 = toPublicCountryCode(countryIso3)
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

async function loadPlanPrices(internalPlanIds: string[]): Promise<Map<string, { price: number; currency: string }>> {
  const map = new Map<string, { price: number; currency: string }>()
  if (!internalPlanIds.length) return map
  const res = await supabaseRest(
    `internal_plan_provider_mapping?enabled=eq.true&internal_plan_id=in.(${internalPlanIds.map(enc).join(',')})&select=internal_plan_id,provider_price,provider_currency&limit=5000`,
    { cache: 'no-store' },
  )
  if (!res.ok) return map
  const rows = (await res.json()) as Array<{
    internal_plan_id: string
    provider_price: number | null
    provider_currency: string | null
  }>
  for (const row of rows) {
    const price = num(row.provider_price, 0)
    if (price <= 0) continue
    const existing = map.get(row.internal_plan_id)
    if (!existing || price < existing.price) {
      map.set(row.internal_plan_id, {
        price,
        currency: (row.provider_currency ?? 'EUR').toUpperCase(),
      })
    }
  }
  return map
}

function systemPlanToPublic(row: Record<string, unknown>, operatorId: string): PublicPlan {
  const amount = num(row.amount, 0)
  const currency = String(row.currency ?? 'EUR').toUpperCase()
  const priceInr = currency === 'INR' ? Math.round(amount) : Math.round(amount * 90)
  const priceEur = currency === 'EUR' ? Number(amount.toFixed(2)) : Number((amount / 90).toFixed(2))
  return {
    id: String(row.id),
    systemPlanId: String(row.id),
    internalPlanId: row.internal_plan_id != null ? String(row.internal_plan_id) : undefined,
    operatorId,
    price_inr: priceInr,
    price_eur: priceEur,
    validity: String(row.validity ?? ''),
    data: row.data_volume != null ? String(row.data_volume) : undefined,
    benefits: String(row.description ?? row.system_plan_name ?? ''),
    tag: 'none',
    type: mapPlanType(String(row.plan_type ?? row.category ?? 'topup')),
    planName: String(row.system_plan_name ?? 'Plan'),
    currency,
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

  const prices = await loadPlanPrices(matched.map((r) => r.id))
  return matched.map((row, idx) => {
    const pricing = prices.get(row.id)
    const amount = pricing?.price ?? 0
    const currency = pricing?.currency ?? 'EUR'
    const priceInr = currency === 'INR' ? Math.round(amount) : Math.round(amount * 90)
    const priceEur = currency === 'EUR' ? Number(amount.toFixed(2)) : Number((amount / 90).toFixed(2))
    return {
      id: row.id,
      internalPlanId: row.id,
      operatorId: row.operator_ref,
      price_inr: priceInr,
      price_eur: priceEur,
      validity: row.subservice ?? '',
      benefits: row.uti_description ?? displayPlanName(row),
      tag: idx < 3 ? 'popular' : 'none',
      type: mapPlanType(row.category),
      planName: displayPlanName(row),
      currency,
    }
  })
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
      rows = rows.filter((p) => p.type === category || mapPlanType(p.type) === category)
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
  const prices = await loadPlanPrices(rows.map((r) => r.id))
  return rows.map((row, idx) => {
    const pricing = prices.get(row.id)
    const amount = pricing?.price ?? 0
    const currency = pricing?.currency ?? 'EUR'
    const priceInr = currency === 'INR' ? Math.round(amount) : Math.round(amount * 90)
    const priceEur = currency === 'EUR' ? Number(amount.toFixed(2)) : Number((amount / 90).toFixed(2))
    return {
      id: row.id,
      internalPlanId: row.id,
      operatorId: operatorRef,
      price_inr: priceInr,
      price_eur: priceEur,
      validity: row.subservice ?? '',
      benefits: row.uti_description ?? displayPlanName(row),
      tag: idx < 3 ? 'popular' : 'none',
      type: mapPlanType(row.category),
      planName: displayPlanName(row),
      currency,
    }
  })
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
  const countryIso3 = normalizeCountryIso3(input.countryId ?? input.countryCode ?? '')
  const limit = input.limit ?? 200

  const resolved = await resolvePublicOperatorKey(input.countryId ?? input.countryCode ?? '', {
    operatorId: input.operatorId ?? input.operatorRef,
    operatorName: input.operatorName,
  })
  const operatorId = resolved?.id ?? (input.operatorId ?? input.operatorRef ?? '').trim()
  const operatorName = resolved?.name ?? input.operatorName?.trim()

  if (!operatorId && !operatorName) return []

  let plans: PublicPlan[] = []

  if (operatorId && (await isAggregatorSchemaReady())) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(operatorId)
    if (isUuid) {
      const rows = (await aggListSystemPlans({
        systemOperatorId: operatorId,
        q: input.search,
        limit,
        offset: 0,
      })) as Record<string, unknown>[]
      if (rows.length) plans = rows.map((r) => systemPlanToPublic(r, operatorId))
    }
  }

  if (!plans.length && countryIso3 && operatorId) {
    plans = await listPlansFromInternalPlans(countryIso3, operatorId)
  }

  if (!plans.length && countryIso3 && operatorName) {
    plans = await listPlansFromInternalPlansByName(countryIso3, operatorName)
  }

  if (!plans.length && operatorId) {
    try {
      const iso2 = countryIso3 ? toPublicCountryCode(countryIso3) : (input.countryCode ?? 'IN')
      const legacy = await dbFetchPlans(iso2, operatorId)
      plans = legacy.map((p) => ({
        id: p.sku_code,
        internalPlanId: p.sku_code,
        operatorId,
        price_inr: Math.round(num(p.price_inr)),
        price_eur: Number(num(p.price_eur).toFixed(2)),
        validity: p.validity ?? '',
        data: p.data_label ?? undefined,
        benefits: p.benefits ?? '',
        tag: p.tag === 'popular' ? ('popular' as const) : ('none' as const),
        type: mapPlanType(p.plan_type),
        planName: p.plan_name ?? p.sku_code,
      }))
    } catch {
      plans = []
    }
  }

  return applyPlanFilters(plans, { search: input.search, category: input.category }).slice(0, limit)
}

export async function detectPublicOperator(input: {
  phoneNumber: string
  countryCode: string
}): Promise<{ operator: string; providerCode?: string; country: string; source: string }> {
  const countryIso3 = normalizeCountryIso3(input.countryCode)
  const operators = await fetchPublicOperators(input.countryCode)
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
  const picked = pickOperatorForPhone(legacyShape, input.phoneNumber)
  if (picked) {
    return {
      operator: (picked.short_name ?? picked.name).trim(),
      providerCode: picked.code,
      country: input.countryCode.toUpperCase(),
      source: 'database',
    }
  }
  const defaultOp = legacyShape.find((o) => o.is_default === true)
  if (defaultOp) {
    return {
      operator: (defaultOp.short_name ?? defaultOp.name).trim(),
      providerCode: defaultOp.code,
      country: input.countryCode.toUpperCase(),
      source: 'database',
    }
  }
  if (operators.length === 1) {
    const o = operators[0]!
    return {
      operator: o.shortName,
      providerCode: o.code,
      country: input.countryCode.toUpperCase(),
      source: 'database',
    }
  }
  return {
    operator: 'Unknown',
    providerCode: undefined,
    country: countryIso3 || input.countryCode.toUpperCase(),
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
    const rows = (await aggListSystemOperators({ limit: 5000, offset: 0 })) as Array<{ country_id: string }>
    for (const row of rows) {
      const iso3 = (row.country_id ?? '').toUpperCase()
      const iso2 = toPublicCountryCode(iso3)
      out[iso3] = (out[iso3] ?? 0) + 1
      out[iso2] = (out[iso2] ?? 0) + 1
    }
  }
  return out
}
