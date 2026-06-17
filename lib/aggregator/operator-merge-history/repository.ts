import { supabaseRest } from '@/lib/db/supabase-rest'
import { normalizeOperatorForRegistry } from '@/lib/aggregator/catalog-intelligence/brand-intelligence'
import { buildStableOperatorMergeKey } from '@/lib/aggregator/merge-keys'
import { OperatorMergeHistoryMatcher } from './matcher'
import type {
  OperatorMergeHistoryRow,
  OperatorMergeHistoryUpsertInput,
} from './types'

function enc(value: string): string {
  return encodeURIComponent(value)
}

function mapRow(row: Record<string, unknown>): OperatorMergeHistoryRow {
  const sourceNormalized = String(row.source_operator_normalized ?? '')
  const targetNormalized = String(row.target_operator_normalized ?? '')
  return {
    id: String(row.id ?? ''),
    countryIso3: String(row.country_iso3 ?? '').toUpperCase(),
    sourceOperatorName: String(row.source_operator_name ?? ''),
    sourceOperatorNormalized: sourceNormalized,
    targetOperatorName: String(row.target_operator_name ?? ''),
    targetOperatorNormalized: targetNormalized,
    sourceMergeKey: String(row.source_merge_key ?? sourceNormalized),
    targetMergeKey: String(row.target_merge_key ?? targetNormalized),
    mergeReason: String(row.merge_reason ?? 'ADMIN_MERGE'),
    mergedByAdmin: row.merged_by_admin ? String(row.merged_by_admin) : null,
    isActive: row.is_active !== false,
    createdAt: row.created_at ? String(row.created_at) : null,
  }
}

export async function resolveCountryIso3FromCountryId(countryId: string | null | undefined): Promise<string | null> {
  if (!countryId) return null
  const res = await supabaseRest(`countries?id=eq.${enc(countryId)}&select=iso3&limit=1`, {
    cache: 'no-store',
  }).catch(() => null)
  if (!res?.ok) return null
  const rows = (await res.json().catch(() => [])) as Array<{ iso3?: string }>
  return rows[0]?.iso3 ? String(rows[0].iso3).toUpperCase() : null
}

export async function upsertOperatorMergeHistory(
  input: OperatorMergeHistoryUpsertInput,
): Promise<OperatorMergeHistoryRow | null> {
  const countryIso3 = input.countryIso3.trim().toUpperCase()
  const sourceOperatorName = input.sourceOperatorName.trim()
  const targetOperatorName = input.targetOperatorName.trim()
  const sourceOperatorNormalized = buildStableOperatorMergeKey(sourceOperatorName)
  const targetOperatorNormalized = buildStableOperatorMergeKey(targetOperatorName)
  if (!countryIso3 || !sourceOperatorNormalized || !targetOperatorNormalized) return null

  const res = await supabaseRest('operator_merge_history?on_conflict=country_iso3,source_operator_normalized', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      country_iso3: countryIso3,
      source_operator_name: sourceOperatorName,
      source_operator_normalized: sourceOperatorNormalized,
      target_operator_name: targetOperatorName,
      target_operator_normalized: targetOperatorNormalized,
      source_merge_key: sourceOperatorNormalized,
      target_merge_key: targetOperatorNormalized,
      merge_reason: input.mergeReason ?? 'ADMIN_MERGE',
      merged_by_admin: input.mergedByAdmin ?? null,
      is_active: input.isActive ?? true,
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => null)

  if (!res?.ok) return null
  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function loadOperatorMergeHistory(countryIso3?: string): Promise<OperatorMergeHistoryRow[]> {
  const filters = ['is_active=eq.true', 'select=*', 'order=created_at.desc', 'limit=5000']
  if (countryIso3) filters.unshift(`country_iso3=eq.${enc(countryIso3.toUpperCase())}`)

  const res = await supabaseRest(`operator_merge_history?${filters.join('&')}`, {
    cache: 'no-store',
  }).catch(() => null)
  if (!res?.ok) return []

  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[]
  return rows.map(mapRow)
}

export async function loadAllOperatorMergeHistory(countryIso3?: string): Promise<OperatorMergeHistoryRow[]> {
  const filters = ['select=*', 'order=created_at.desc', 'limit=5000']
  if (countryIso3) filters.unshift(`country_iso3=eq.${enc(countryIso3.toUpperCase())}`)

  const res = await supabaseRest(`operator_merge_history?${filters.join('&')}`, {
    cache: 'no-store',
  }).catch(() => null)
  if (!res?.ok) return []

  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[]
  return rows.map(mapRow)
}

export async function patchOperatorMergeHistory(
  id: string,
  patch: { isActive?: boolean },
): Promise<OperatorMergeHistoryRow | null> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.isActive !== undefined) body.is_active = patch.isActive

  const res = await supabaseRest(`operator_merge_history?id=eq.${enc(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  }).catch(() => null)

  if (!res?.ok) return null
  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function deleteOperatorMergeHistory(id: string): Promise<boolean> {
  const res = await supabaseRest(`operator_merge_history?id=eq.${enc(id)}`, {
    method: 'DELETE',
  }).catch(() => null)
  return Boolean(res?.ok)
}

export async function createOperatorMergeHistoryMatcher(
  countryIso3?: string,
): Promise<OperatorMergeHistoryMatcher> {
  const rows = await loadOperatorMergeHistory(countryIso3)
  return new OperatorMergeHistoryMatcher(rows)
}
