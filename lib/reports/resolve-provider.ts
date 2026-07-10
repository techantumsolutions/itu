/**
 * Resolve top-up provider identity from transaction / recharge_order shapes.
 * Provider may be stored as name, code, UUID, or nested under routing / LCR metadata.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'

export type LcrProviderIndex = {
  byId: Map<string, { id: string; code: string; name: string }>
  byCode: Map<string, { id: string; code: string; name: string }>
  byName: Map<string, { id: string; code: string; name: string }>
  list: Array<{ id: string; code: string; name: string }>
}

export type ResolvedProvider = {
  /** Stable group key (prefer provider code, lowercased). */
  key: string
  /** Display label (prefer lcr_providers.name). */
  label: string
  id: string | null
  code: string | null
  providerRef: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

function unwrapEmbedded(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return asRecord(v[0])
  return asRecord(v)
}

export async function loadLcrProviderIndex(): Promise<LcrProviderIndex> {
  const byId = new Map<string, { id: string; code: string; name: string }>()
  const byCode = new Map<string, { id: string; code: string; name: string }>()
  const byName = new Map<string, { id: string; code: string; name: string }>()
  const list: Array<{ id: string; code: string; name: string }> = []

  try {
    const res = await supabaseRest(
      'lcr_providers?select=id,code,name&order=priority.asc&limit=200',
      { cache: 'no-store' },
    )
    if (!res.ok) return { byId, byCode, byName, list }
    const rows = (await res.json()) as Array<{ id: string; code: string | null; name: string | null }>
    for (const row of rows) {
      const entry = {
        id: row.id,
        code: String(row.code ?? '').trim(),
        name: String(row.name ?? '').trim() || String(row.code ?? '').trim() || row.id,
      }
      list.push(entry)
      byId.set(entry.id, entry)
      if (entry.code) byCode.set(entry.code.toLowerCase(), entry)
      if (entry.name) byName.set(entry.name.toLowerCase(), entry)
    }
  } catch {
    // leave empty index
  }

  return { byId, byCode, byName, list }
}

function lookup(index: LcrProviderIndex | undefined, raw: string | null) {
  if (!raw || !index) return null
  if (index.byId.has(raw)) return index.byId.get(raw)!
  const lower = raw.toLowerCase()
  return index.byCode.get(lower) ?? index.byName.get(lower) ?? null
}

/** Collect every known provider hint from a transactions (+ recharge_orders) row. */
export function collectProviderHints(row: Record<string, unknown>): {
  id: string | null
  code: string | null
  name: string | null
  providerRef: string | null
} {
  const meta = asRecord(row.metadata)
  const ro = unwrapEmbedded(row.recharge_orders)
  const roMeta = asRecord(ro?.metadata)
  const routing = asRecord(meta?.routing) ?? asRecord(roMeta?.routing)
  const routingSelected = asRecord(routing?.selected)
  const routingResult = asRecord(meta?.routing_result) ?? asRecord(roMeta?.routing_result)
  const lcr = asRecord(meta?.lcr_result) ?? asRecord(roMeta?.lcr_result)

  const nameCandidates = [
    ro?.provider,
    meta?.selected_provider_name,
    meta?.provider_name,
    routingSelected?.providerName,
    routingResult?.selected_provider_name,
    routingResult?.selected_provider,
    lcr?.selectedProviderName,
    meta?.selected_provider,
    meta?.provider,
  ]
  const idCandidates = [
    meta?.selected_provider_id,
    meta?.provider_used,
    routingSelected?.providerId,
    routingResult?.selected_provider_id,
    lcr?.selectedProviderId,
    lcr?.selectedProvider,
    roMeta?.selected_provider,
    meta?.selected_provider,
    ro?.provider,
  ]
  const codeCandidates = [
    meta?.provider_code,
    routingSelected?.providerCode,
    routingResult?.selected_provider_code,
    lcr?.selectedProviderCode,
    roMeta?.provider_code,
  ]

  const pickName = () => {
    for (const c of nameCandidates) {
      const s = str(c)
      if (s && !UUID_RE.test(s)) return s
    }
    return null
  }
  const pickId = () => {
    for (const c of idCandidates) {
      const s = str(c)
      if (s && UUID_RE.test(s)) return s
    }
    return null
  }
  const pickCode = () => {
    for (const c of codeCandidates) {
      const s = str(c)
      if (s) return s
    }
    return null
  }

  return {
    id: pickId(),
    code: pickCode(),
    name: pickName(),
    providerRef: str(ro?.provider_ref) ?? str(meta?.provider_ref) ?? null,
  }
}

export function resolveProviderFromRow(
  row: Record<string, unknown>,
  index?: LcrProviderIndex,
): ResolvedProvider {
  const hints = collectProviderHints(row)

  const fromId = lookup(index, hints.id)
  const fromCode = lookup(index, hints.code)
  const fromName = lookup(index, hints.name)
  // If provider column stored a UUID, resolve it
  const fromRawUuid = hints.name == null && hints.id == null
    ? lookup(index, str(unwrapEmbedded(row.recharge_orders)?.provider))
    : null

  const matched = fromId ?? fromCode ?? fromName ?? fromRawUuid

  if (matched) {
    return {
      key: (matched.code || matched.name || matched.id).toLowerCase(),
      label: matched.name || matched.code || matched.id,
      id: matched.id,
      code: matched.code || null,
      providerRef: hints.providerRef,
    }
  }

  const fallback = hints.code ?? hints.name ?? hints.id
  if (!fallback) {
    return { key: 'unknown', label: 'unknown', id: null, code: null, providerRef: hints.providerRef }
  }

  return {
    key: fallback.toLowerCase(),
    label: hints.name ?? hints.code ?? fallback,
    id: hints.id,
    code: hints.code,
    providerRef: hints.providerRef,
  }
}

export function providerMatchesFilter(
  row: Record<string, unknown>,
  filterValue: string,
  index?: LcrProviderIndex,
): boolean {
  const needle = filterValue.trim().toLowerCase()
  if (!needle) return true
  const resolved = resolveProviderFromRow(row, index)
  return (
    resolved.key.includes(needle) ||
    resolved.label.toLowerCase().includes(needle) ||
    (resolved.code?.toLowerCase().includes(needle) ?? false) ||
    (resolved.id?.toLowerCase().includes(needle) ?? false) ||
    (resolved.providerRef?.toLowerCase().includes(needle) ?? false)
  )
}
