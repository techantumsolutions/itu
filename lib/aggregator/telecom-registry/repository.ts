import { supabaseRest } from '@/lib/db/supabase-rest'
import type { DomainOperatorRegistryRow, RegistryUpsertInput } from './types'

function enc(v: string): string {
  return encodeURIComponent(v)
}

function rowFromDb(row: Record<string, unknown>): DomainOperatorRegistryRow {
  const aliases = Array.isArray(row.aliases_json)
    ? row.aliases_json.map((value) => String(value))
    : []
  return {
    id: row.id ? String(row.id) : undefined,
    countryIso3: String(row.country_iso3 ?? '').toUpperCase(),
    operatorName: String(row.operator_name ?? ''),
    normalizedName: String(row.normalized_name ?? ''),
    slug: String(row.slug ?? ''),
    aliases,
    mcc: row.mcc ? String(row.mcc) : null,
    mnc: row.mnc ? String(row.mnc) : null,
    domain: String(row.domain ?? 'MOBILE').toUpperCase(),
    isActive: row.is_active !== false,
    source: String(row.source ?? 'manual'),
  }
}

let cachedRows: DomainOperatorRegistryRow[] | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

export function clearDomainOperatorRegistryCache() {
  cachedRows = null
  cacheLoadedAt = 0
}

export async function loadDomainOperatorRegistry(force = false): Promise<DomainOperatorRegistryRow[]> {
  if (!force && cachedRows && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedRows
  }

  const rows: DomainOperatorRegistryRow[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const res = await supabaseRest(
      `domain_operator_registry?is_active=eq.true&domain=eq.MOBILE&select=*&limit=1000&offset=${offset}`,
      { cache: 'no-store' },
    ).catch(() => null)

    if (!res?.ok) break
    const batch = (await res.json().catch(() => [])) as Array<Record<string, unknown>>
    if (!batch.length) {
      hasMore = false
      break
    }
    rows.push(...batch.map(rowFromDb))
    offset += batch.length
    hasMore = batch.length === 1000
  }

  cachedRows = rows
  cacheLoadedAt = Date.now()
  return rows
}

export async function upsertDomainOperatorRegistryRows(inputs: RegistryUpsertInput[]): Promise<number> {
  if (!inputs.length) return 0

  let upserted = 0
  const chunkSize = 100
  for (let i = 0; i < inputs.length; i += chunkSize) {
    const chunk = inputs.slice(i, i + chunkSize).map((input) => ({
      country_iso3: input.countryIso3.toUpperCase(),
      operator_name: input.operatorName,
      normalized_name: input.normalizedName,
      slug: input.slug,
      aliases_json: input.aliases,
      mcc: input.mcc ?? null,
      mnc: input.mnc ?? null,
      domain: input.domain ?? 'MOBILE',
      is_active: true,
      source: input.source,
    }))

    const res = await supabaseRest('domain_operator_registry?on_conflict=country_iso3,normalized_name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    })

    if (!res.ok) {
      throw new Error(await res.text())
    }
    upserted += chunk.length
  }

  clearDomainOperatorRegistryCache()
  return upserted
}

export async function countDomainOperatorRegistry(countryIso3?: string): Promise<number> {
  const filters = ['select=id', 'limit=1']
  if (countryIso3) filters.unshift(`country_iso3=eq.${enc(countryIso3.toUpperCase())}`)
  const res = await supabaseRest(`domain_operator_registry?${filters.join('&')}`, {
    cache: 'no-store',
    headers: { Prefer: 'count=exact' },
  }).catch(() => null)
  if (!res?.ok) return 0
  const contentRange = res.headers.get('content-range') ?? ''
  const total = Number(contentRange.split('/')[1] ?? 0)
  return Number.isFinite(total) ? total : 0
}

/** Backward-compatible country-scoped MOBILE entries for CatalogIntelligenceEngine (operator_domain_registry). */
export async function syncLegacyOperatorDomainRegistry(rows: RegistryUpsertInput[]): Promise<number> {
  const payload = rows.map((row) => ({
    country_iso3: row.countryIso3.toUpperCase(),
    operator_name: row.operatorName,
    normalized_name: row.normalizedName,
    operator_domain: 'MOBILE',
    confidence: 95,
    is_verified: true,
  }))

  let synced = 0
  const chunkSize = 100
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize)
    const res = await supabaseRest(
      'operator_domain_registry?on_conflict=country_iso3,normalized_name,operator_domain',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      },
    )
    if (!res.ok) throw new Error(await res.text())
    synced += chunk.length
  }
  return synced
}

export async function listDomainOperatorRegistry(params: {
  country?: string
  q?: string
  limit?: number
  offset?: number
  table?: 'domain' | 'legacy'
}): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const table = params.table === 'legacy' ? 'operator_domain_registry' : 'domain_operator_registry'
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000)
  const offset = Math.max(params.offset ?? 0, 0)
  const filters = [
    'select=*',
    `limit=${limit}`,
    `offset=${offset}`,
    'order=country_iso3.asc,operator_name.asc',
  ]

  if (params.country) {
    filters.unshift(`country_iso3=eq.${enc(params.country.trim().toUpperCase())}`)
  }
  if (params.q) {
    const term = params.q.trim()
    if (term) {
      const searchFilter =
        table === 'domain_operator_registry'
          ? `or=(operator_name.ilike.*${enc(term)}*,normalized_name.ilike.*${enc(term)}*,slug.ilike.*${enc(term)}*)`
          : `or=(operator_name.ilike.*${enc(term)}*,normalized_name.ilike.*${enc(term)}*)`
      filters.unshift(searchFilter)
    }
  }

  if (table === 'domain_operator_registry') {
    filters.unshift('is_active=eq.true', 'domain=eq.MOBILE')
  } else {
    filters.unshift('is_verified=eq.true', 'operator_domain=eq.MOBILE')
  }

  const res = await supabaseRest(`${table}?${filters.join('&')}`, {
    cache: 'no-store',
    headers: { Prefer: 'count=exact' },
  })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as Record<string, unknown>[]
  const contentRange = res.headers.get('content-range') ?? ''
  const total = Number(contentRange.split('/')[1] ?? rows.length)
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

export async function countLegacyOperatorDomainRegistry(): Promise<number> {
  const res = await supabaseRest('operator_domain_registry?select=id&limit=1', {
    cache: 'no-store',
    headers: { Prefer: 'count=exact' },
  }).catch(() => null)
  if (!res?.ok) return 0
  const contentRange = res.headers.get('content-range') ?? ''
  const total = Number(contentRange.split('/')[1] ?? 0)
  return Number.isFinite(total) ? total : 0
}
