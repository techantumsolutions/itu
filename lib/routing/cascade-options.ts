import { aggListSystemOperators } from '@/lib/aggregator/repository'
import { isMobileCatalogOperator } from '@/lib/catalog/mobile-catalog-filter'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { countryDisplayName } from '@/lib/lcr/countries'
import { ROUTING_PRODUCT_TYPE_OPTIONS } from '@/lib/routing/rule-form-options'

const PAGE_SIZE = 1000

function enc(v: string): string {
  return encodeURIComponent(v)
}

function operatorRefForSystemId(operatorId: string): string {
  return `system:${operatorId}`
}

export const ROUTING_CATEGORY_LABELS: Record<string, string> = {
  topup: 'Top-up',
  airtime: 'Airtime',
  data: 'Data',
  combo: 'Combo',
}

export async function fetchRoutingCountries(): Promise<{ iso3: string; label: string }[]> {
  const all: string[] = []
  let offset = 0
  while (true) {
    const res = await supabaseRest(
      `internal_plans?select=country_iso3&country_iso3=not.is.null&active=eq.true&order=country_iso3.asc&limit=${PAGE_SIZE}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const rows = (await res.json()) as { country_iso3?: string }[]
    for (const row of rows) {
      const iso = String(row.country_iso3 ?? '').trim().toUpperCase()
      if (iso) all.push(iso)
    }
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return [...new Set(all)].sort().map((iso3) => ({
    iso3,
    label: `${countryDisplayName(iso3)} (${iso3})`,
  }))
}

export async function fetchRoutingOperators(countryIso3: string) {
  const country = countryIso3.trim().toUpperCase()
  const rows = (await aggListSystemOperators({ country, limit: 500, offset: 0, mobileCatalogOnly: true })) as Record<string, unknown>[]
  return rows
    .filter((row) => isMobileCatalogOperator(row))
    .map((row) => {
    const id = String(row.id ?? '')
    const name = String(row.system_operator_name ?? row.slug ?? id)
    return {
      id,
      label: name,
      countryId: country,
    }
  })
}

export async function fetchRoutingProductTypes(countryIso3: string, operatorId: string) {
  const country = countryIso3.trim().toUpperCase()
  const operatorRef = operatorRefForSystemId(operatorId)
  const res = await supabaseRest(
    `internal_plans?country_iso3=eq.${enc(country)}&operator_ref=eq.${enc(operatorRef)}&active=eq.true&select=category&limit=${PAGE_SIZE}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as { category?: string }[]
  const categories = [...new Set(rows.map((r) => String(r.category ?? '').trim().toLowerCase()).filter(Boolean))].sort()
  return categories.map((value) => ({
    value,
    label: ROUTING_CATEGORY_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1),
  }))
}

export async function fetchRoutingProviders(
  countryIso3: string,
  operatorId: string,
  productType?: string,
): Promise<{ id: string; code: string; name: string; label: string }[]> {
  const country = countryIso3.trim().toUpperCase()
  const operatorRef = operatorRefForSystemId(operatorId)
  const filters = [
    `country_iso3=eq.${enc(country)}`,
    `operator_ref=eq.${enc(operatorRef)}`,
    'active=eq.true',
    'select=id',
    `limit=${PAGE_SIZE}`,
  ]
  if (productType?.trim()) {
    filters.splice(3, 0, `category=eq.${enc(productType.trim().toLowerCase())}`)
  }
  const plansRes = await supabaseRest(`internal_plans?${filters.join('&')}`, { cache: 'no-store' })
  if (!plansRes.ok) return []
  const planRows = (await plansRes.json()) as { id?: string }[]
  const planIds = planRows.map((r) => String(r.id ?? '')).filter(Boolean)
  if (!planIds.length) return []

  const mapRes = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=in.(${planIds.map(enc).join(',')})&enabled=eq.true&select=provider_id,lcr_providers(id,code,name,is_active)`,
    { cache: 'no-store' },
  )
  if (!mapRes.ok) return []
  const mappings = (await mapRes.json()) as Array<{
    provider_id?: string
    lcr_providers?: { id?: string; code?: string; name?: string; is_active?: boolean } | null
  }>

  const byId = new Map<string, { id: string; code: string; name: string; label: string }>()
  for (const m of mappings) {
    const prov = m.lcr_providers
    const id = String(prov?.id ?? m.provider_id ?? '')
    if (!id || prov?.is_active === false) continue
    const code = String(prov?.code ?? '')
    const name = String(prov?.name ?? code ?? id)
    byId.set(id, { id, code, name, label: `${name}${code ? ` (${code})` : ''}` })
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function fallbackProductTypeOptions() {
  return ROUTING_PRODUCT_TYPE_OPTIONS.filter((o) => o.value !== '__ANY__')
}
