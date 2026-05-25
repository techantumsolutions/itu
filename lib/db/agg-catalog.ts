import { supabaseRest } from '@/lib/db/supabase-rest'

export type AggProvider = 'dtone'

export type AggPlanFilters = {
  provider?: AggProvider
  countryIso3?: string
  operatorId?: string
  serviceId?: number
  subserviceId?: number
  tag?: string
  minRetail?: number
  maxRetail?: number
  status?: 'active' | 'inactive' | 'disabled'
  limit?: number
  offset?: number
}

function enc(v: string): string {
  return encodeURIComponent(v)
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

export async function dbUpsertAggCountries(rows: Array<{ iso3: string; iso2?: string; name: string; raw_response?: unknown }>) {
  if (!rows.length) return
  const res = await supabaseRest('agg_countries?on_conflict=iso3', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(
      rows.map((r) => ({
        iso3: r.iso3,
        iso2: r.iso2 ?? null,
        name: r.name,
        raw_response: r.raw_response ?? {},
        status: 'active',
      }))
    ),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbUpsertAggOperators(
  rows: Array<{
    provider: AggProvider
    aggregator_operator_id: number
    country_iso3: string
    name: string
    regions?: unknown
    raw_response?: unknown
  }>
) {
  if (!rows.length) return
  const res = await supabaseRest('agg_operators?on_conflict=provider,aggregator_operator_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(
      rows.map((r) => ({
        provider: r.provider,
        aggregator_operator_id: r.aggregator_operator_id,
        country_iso3: r.country_iso3,
        name: r.name,
        regions: r.regions ?? [],
        raw_response: r.raw_response ?? {},
        status: 'active',
      }))
    ),
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as Array<{ id: string; provider: string; aggregator_operator_id: number }>
}

export async function dbUpsertAggServices(rows: Array<{ provider: AggProvider; service_id: number; name: string; raw_response?: unknown }>) {
  if (!rows.length) return
  const res = await supabaseRest('agg_services?on_conflict=provider,service_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(
      rows.map((r) => ({
        provider: r.provider,
        service_id: r.service_id,
        name: r.name,
        raw_response: r.raw_response ?? {},
        status: 'active',
      }))
    ),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbUpsertAggSubservices(
  rows: Array<{ provider: AggProvider; subservice_id: number; service_id: number; name: string; raw_response?: unknown }>
) {
  if (!rows.length) return
  const res = await supabaseRest('agg_subservices?on_conflict=provider,subservice_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(
      rows.map((r) => ({
        provider: r.provider,
        subservice_id: r.subservice_id,
        service_id: r.service_id,
        name: r.name,
        raw_response: r.raw_response ?? {},
        status: 'active',
      }))
    ),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbUpsertAggPlans(
  rows: Array<{
    provider: AggProvider
    aggregator_plan_id: number
    operator_id: string
    service_id?: number | null
    subservice_id?: number | null
    type: string
    name: string
    description?: string | null
    availability_zones?: string[]
    destination_amount?: number | null
    destination_unit?: string | null
    destination_unit_type?: string | null
    retail_amount?: number | null
    retail_fee?: number | null
    wholesale_amount?: number | null
    wholesale_fee?: number | null
    source_amount?: number | null
    source_unit?: string | null
    currency_unit?: string | null
    rate_base?: number | null
    rate_retail?: number | null
    rate_wholesale?: number | null
    validity_quantity?: number | null
    validity_unit?: string | null
    tags?: string[]
    raw_response?: unknown
  }>
) {
  if (!rows.length) return
  const res = await supabaseRest('agg_plans?on_conflict=provider,aggregator_plan_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(
      rows.map((r) => ({
        provider: r.provider,
        aggregator_plan_id: r.aggregator_plan_id,
        operator_id: r.operator_id,
        service_id: r.service_id ?? null,
        subservice_id: r.subservice_id ?? null,
        type: r.type,
        name: r.name,
        description: r.description ?? null,
        availability_zones: r.availability_zones ?? [],
        destination_amount: r.destination_amount ?? null,
        destination_unit: r.destination_unit ?? null,
        destination_unit_type: r.destination_unit_type ?? null,
        retail_amount: r.retail_amount ?? null,
        retail_fee: r.retail_fee ?? null,
        wholesale_amount: r.wholesale_amount ?? null,
        wholesale_fee: r.wholesale_fee ?? null,
        source_amount: r.source_amount ?? null,
        source_unit: r.source_unit ?? null,
        currency_unit: r.currency_unit ?? null,
        rate_base: r.rate_base ?? null,
        rate_retail: r.rate_retail ?? null,
        rate_wholesale: r.rate_wholesale ?? null,
        validity_quantity: r.validity_quantity ?? null,
        validity_unit: r.validity_unit ?? null,
        tags: r.tags ?? [],
        raw_response: r.raw_response ?? {},
        status: 'active',
      }))
    ),
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as Array<{ id: string; provider: string; aggregator_plan_id: number }>
}

export async function dbReplaceAggPlanBenefits(
  planId: string,
  benefits: Array<{
    type: string
    amount_base?: number | null
    promotion_bonus?: number | null
    total_excluding_tax?: number | null
    total_including_tax?: number | null
    unit?: string | null
    unit_type?: string | null
    additional_information?: string | null
    raw_response?: unknown
  }>
) {
  // Delete + insert to keep it simple and consistent.
  const del = await supabaseRest(`agg_plan_benefits?plan_id=eq.${enc(planId)}`, { method: 'DELETE' })
  if (!del.ok) throw new Error(await del.text())
  if (!benefits.length) return
  const ins = await supabaseRest('agg_plan_benefits', {
    method: 'POST',
    body: JSON.stringify(
      benefits.map((b) => ({
        plan_id: planId,
        type: text(b.type),
        amount_base: b.amount_base ?? null,
        promotion_bonus: b.promotion_bonus ?? null,
        total_excluding_tax: b.total_excluding_tax ?? null,
        total_including_tax: b.total_including_tax ?? null,
        unit: b.unit ?? null,
        unit_type: b.unit_type ?? null,
        additional_information: b.additional_information ?? null,
        raw_response: b.raw_response ?? {},
      }))
    ),
  })
  if (!ins.ok) throw new Error(await ins.text())
}

export async function dbReplaceAggPlanRequiredFields(planId: string, groups: string[][]) {
  const del = await supabaseRest(`agg_plan_required_fields?plan_id=eq.${enc(planId)}`, { method: 'DELETE' })
  if (!del.ok) throw new Error(await del.text())
  const rows: Array<{ plan_id: string; field_group: number; field_name: string }> = []
  groups.forEach((g, idx) => g.forEach((f) => rows.push({ plan_id: planId, field_group: idx, field_name: f })))
  if (!rows.length) return
  const ins = await supabaseRest('agg_plan_required_fields', { method: 'POST', body: JSON.stringify(rows) })
  if (!ins.ok) throw new Error(await ins.text())
}

export async function dbSetAggPlansInactiveExcept(provider: AggProvider, aggregatorPlanIds: number[]) {
  // Mark all as inactive then upsert actives back to active would be expensive.
  // Instead, inactivate those not in the fetched set using "not.in".
  if (!aggregatorPlanIds.length) return
  const list = aggregatorPlanIds.map((n) => String(n)).join(',')
  const res = await supabaseRest(`agg_plans?provider=eq.${enc(provider)}&aggregator_plan_id=not.in.(${list})`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'inactive' }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbLogAggApi(payload: {
  provider: AggProvider
  endpoint: string
  method?: string
  status?: number
  request_id?: string
  duration_ms?: number
  error?: string
  response?: unknown
}) {
  const res = await supabaseRest('agg_api_logs', {
    method: 'POST',
    body: JSON.stringify({
      provider: payload.provider,
      endpoint: payload.endpoint,
      method: payload.method ?? 'GET',
      status: payload.status ?? null,
      request_id: payload.request_id ?? null,
      duration_ms: payload.duration_ms ?? null,
      error: payload.error ?? null,
      response: payload.response ?? null,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbListAggPlans(filters: AggPlanFilters) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)
  const provider = filters.provider ?? 'dtone'

  let q =
    'agg_plans?select=id,provider,aggregator_plan_id,name,description,type,availability_zones,tags,validity_quantity,validity_unit,' +
    'retail_amount,retail_fee,wholesale_amount,wholesale_fee,source_unit,destination_amount,destination_unit,status,' +
    'operator:agg_operators(id,name,country_iso3,aggregator_operator_id)'

  const where: string[] = [`provider=eq.${enc(provider)}`]
  if (filters.status) where.push(`status=eq.${enc(filters.status)}`)
  if (filters.operatorId) where.push(`operator_id=eq.${enc(filters.operatorId)}`)
  if (filters.serviceId != null) where.push(`service_id=eq.${enc(String(filters.serviceId))}`)
  if (filters.subserviceId != null) where.push(`subservice_id=eq.${enc(String(filters.subserviceId))}`)
  if (filters.tag) where.push(`tags=cs.{${enc(filters.tag.toUpperCase())}}`)
  if (filters.minRetail != null) where.push(`retail_amount=gte.${enc(String(filters.minRetail))}`)
  if (filters.maxRetail != null) where.push(`retail_amount=lte.${enc(String(filters.maxRetail))}`)

  q = `${q}&${where.join('&')}&order=retail_amount.asc&limit=${limit}&offset=${offset}`

  const res = await supabaseRest(q)
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()

  // Optional country filter performed in-app because country is in embedded operator.
  if (filters.countryIso3) {
    const c = filters.countryIso3.toUpperCase()
    return (Array.isArray(data) ? data : []).filter((p: any) => text(p?.operator?.country_iso3).toUpperCase() === c)
  }

  return data as any[]
}

