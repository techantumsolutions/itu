/**
 * Resolve mobile-operator identity for the Operator Report.
 * Names often live on recharge_orders; metadata may only have system:uuid.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import { ISO3_TO_ISO2 } from '@/lib/lcr/countries'
import { loadProviderIdsBySystemOperatorFromPlans } from '@/lib/admin/load-system-operator-plan-providers'

export type OperatorCatalogEntry = {
  id: string
  name: string
  countryIso3: string
  countryIso2: string
  providerCount: number
}

export type OperatorCatalog = {
  byId: Map<string, OperatorCatalogEntry>
  byNameCountry: Map<string, OperatorCatalogEntry>
  byName: Map<string, OperatorCatalogEntry[]>
}

export type ResolvedOperator = {
  key: string
  label: string
  systemOperatorId: string | null
  countryIso3: string
  countryIso2: string
  providerCount: number
}

const SYSTEM_ID_RE = /^(?:system:)?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function unwrapEmbedded(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return asRecord(v[0])
  return asRecord(v)
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function nameCountryKey(name: string, country: string): string {
  return `${normalizeName(name)}|${country.trim().toUpperCase()}`
}

function extractSystemId(raw: unknown): string | null {
  const s = str(raw)
  if (!s) return null
  const m = s.match(SYSTEM_ID_RE)
  return m ? m[1].toLowerCase() : null
}

function toIso2(iso: string): string {
  const u = iso.trim().toUpperCase()
  if (u.length === 2) return u
  return ISO3_TO_ISO2[u] ?? u
}

export async function loadOperatorCatalog(): Promise<OperatorCatalog> {
  const byId = new Map<string, OperatorCatalogEntry>()
  const byNameCountry = new Map<string, OperatorCatalogEntry>()
  const byName = new Map<string, OperatorCatalogEntry[]>()

  try {
    const [opsRes, mappingRes, planProviders] = await Promise.all([
      supabaseRest(
        'system_operators?select=id,system_operator_name,country_id,status&limit=20000',
        { cache: 'no-store' },
      ),
      supabaseRest(
        'operator_mappings?select=system_operator_id,service_provider_id&limit=50000',
        { cache: 'no-store' },
      ),
      loadProviderIdsBySystemOperatorFromPlans(),
    ])

    const providerSets = new Map<string, Set<string>>()
    for (const [opId, ids] of planProviders) {
      providerSets.set(opId, new Set(ids))
    }

    if (mappingRes.ok) {
      const mappings = (await mappingRes.json()) as Array<{
        system_operator_id?: string
        service_provider_id?: string
      }>
      for (const m of mappings) {
        const opId = String(m.system_operator_id ?? '').trim()
        const pid = String(m.service_provider_id ?? '').trim()
        if (!opId || !pid) continue
        if (!providerSets.has(opId)) providerSets.set(opId, new Set())
        providerSets.get(opId)!.add(pid)
      }
    }

    if (!opsRes.ok) return { byId, byNameCountry, byName }

    const ops = (await opsRes.json()) as Array<{
      id: string
      system_operator_name?: string | null
      country_id?: string | null
      status?: string | null
    }>

    for (const op of ops) {
      const id = String(op.id ?? '').trim()
      if (!id) continue
      const name = String(op.system_operator_name ?? '').trim() || id
      const countryIso3 = String(op.country_id ?? '').trim().toUpperCase()
      const entry: OperatorCatalogEntry = {
        id,
        name,
        countryIso3,
        countryIso2: countryIso3 ? toIso2(countryIso3) : '',
        providerCount: providerSets.get(id)?.size ?? 0,
      }
      byId.set(id.toLowerCase(), entry)
      if (name && countryIso3) byNameCountry.set(nameCountryKey(name, countryIso3), entry)
      const nk = normalizeName(name)
      if (!byName.has(nk)) byName.set(nk, [])
      byName.get(nk)!.push(entry)
    }
  } catch {
    // empty catalog
  }

  return { byId, byNameCountry, byName }
}

function stripCountrySuffix(name: string, countryIso3: string, countryIso2: string): string {
  let next = name.trim()
  for (const code of [countryIso3, countryIso2]) {
    if (!code || code.length < 2) continue
    next = next.replace(new RegExp(`\\s*${code}\\s*$`, 'i'), '').trim()
  }
  return next || name.trim()
}

export function resolveOperatorFromRow(
  row: Record<string, unknown>,
  catalog?: OperatorCatalog,
): ResolvedOperator {
  const meta = asRecord(row.metadata)
  const ro = unwrapEmbedded(row.recharge_orders)
  const routing = asRecord(meta?.routing)
  const routingSelected = asRecord(routing?.selected)

  const systemId =
    extractSystemId(ro?.operator_code) ||
    extractSystemId(meta?.operator_id) ||
    extractSystemId(meta?.system_operator_id) ||
    extractSystemId(meta?.operator_code) ||
    null

  const rawNameCandidates = [
    ro?.operator_name,
    meta?.operator_name,
    meta?.network_name,
    meta?.operator,
    routingSelected?.operatorName,
  ]

  let label: string | null = null
  for (const c of rawNameCandidates) {
    const s = str(c)
    if (!s) continue
    if (SYSTEM_ID_RE.test(s)) continue
    label = s
    break
  }

  const countryRaw =
    str(ro?.country_iso) ||
    str(meta?.country_id) ||
    str(meta?.destination_country_code) ||
    str(meta?.country_iso) ||
    ''
  const countryIso3 = countryRaw.length === 2
    ? (Object.entries(ISO3_TO_ISO2).find(([, iso2]) => iso2 === countryRaw.toUpperCase())?.[0] ?? countryRaw.toUpperCase())
    : countryRaw.toUpperCase()
  const countryIso2 = countryIso3 ? toIso2(countryIso3) : ''
  const labelBase = label ? stripCountrySuffix(label, countryIso3, countryIso2) : null

  const fromId = systemId && catalog ? catalog.byId.get(systemId.toLowerCase()) : null
  const fromNameCountry =
    label && countryIso3 && catalog
      ? catalog.byNameCountry.get(nameCountryKey(label, countryIso3))
        ?? (labelBase ? catalog.byNameCountry.get(nameCountryKey(labelBase, countryIso3)) : null)
        ?? (countryIso2 ? catalog.byNameCountry.get(nameCountryKey(label, countryIso2)) : null)
        ?? (labelBase && countryIso2 ? catalog.byNameCountry.get(nameCountryKey(labelBase, countryIso2)) : null)
      : null

  const nameLookup = (name: string | null) => {
    if (!name || !catalog) return null
    const list = catalog.byName.get(normalizeName(name)) ?? []
    return list.find((e) =>
      !countryIso3 || e.countryIso3 === countryIso3 || e.countryIso2 === countryIso2,
    ) ?? list[0] ?? null
  }

  const fromNameOnly = nameLookup(labelBase) ?? nameLookup(label)
  const matched = fromId ?? fromNameCountry ?? fromNameOnly ?? null

  if (matched) {
    return {
      key: matched.id.toLowerCase(),
      label: matched.name,
      systemOperatorId: matched.id,
      countryIso3: matched.countryIso3 || countryIso3,
      countryIso2: matched.countryIso2 || countryIso2,
      providerCount: matched.providerCount,
    }
  }

  const fallbackLabel = labelBase || label || (systemId ? `Operator ${systemId.slice(0, 8)}` : 'unknown')
  const key = systemId
    ? systemId.toLowerCase()
    : `${normalizeName(fallbackLabel)}|${countryIso3 || countryIso2 || 'XX'}`

  return {
    key,
    label: fallbackLabel,
    systemOperatorId: systemId,
    countryIso3,
    countryIso2,
    providerCount: 0,
  }
}
