import { supabaseRest } from '@/lib/db/supabase-rest'
import { buildOperatorMergeKey } from './keys'
import type { PlanMergeHistoryRow, PlanMergeHistoryUpsertInput } from './types'

function enc(value: string): string {
  return encodeURIComponent(value)
}

function mapRow(row: Record<string, unknown>): PlanMergeHistoryRow {
  return {
    id: String(row.id ?? ''),
    countryIso3: String(row.country_iso3 ?? '').toUpperCase(),
    systemOperatorMergeKey: String(row.system_operator_merge_key ?? ''),
    sourcePlanSignature: String(row.source_plan_signature ?? ''),
    targetPlanSignature: String(row.target_plan_signature ?? ''),
    sourcePlanName: String(row.source_plan_name ?? ''),
    targetPlanName: String(row.target_plan_name ?? ''),
    mergeReason: String(row.merge_reason ?? 'ADMIN_MERGE'),
    mergedByAdmin: row.merged_by_admin ? String(row.merged_by_admin) : null,
    isActive: row.is_active !== false,
    createdAt: row.created_at ? String(row.created_at) : null,
  }
}

export async function upsertPlanMergeHistory(
  input: PlanMergeHistoryUpsertInput,
): Promise<PlanMergeHistoryRow | null> {
  const countryIso3 = input.countryIso3.trim().toUpperCase()
  const systemOperatorMergeKey = buildOperatorMergeKey(input.systemOperatorMergeKey)
  const sourcePlanSignature = input.sourcePlanSignature.trim()
  const targetPlanSignature = input.targetPlanSignature.trim()
  const sourcePlanName = input.sourcePlanName.trim()
  const targetPlanName = input.targetPlanName.trim()

  if (!countryIso3 || !systemOperatorMergeKey || !sourcePlanSignature || !targetPlanSignature) {
    return null
  }

  const res = await supabaseRest(
    'plan_merge_history?on_conflict=country_iso3,system_operator_merge_key,source_plan_signature',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        country_iso3: countryIso3,
        system_operator_merge_key: systemOperatorMergeKey,
        source_plan_signature: sourcePlanSignature,
        target_plan_signature: targetPlanSignature,
        source_plan_name: sourcePlanName,
        target_plan_name: targetPlanName,
        merge_reason: input.mergeReason ?? 'ADMIN_MERGE',
        merged_by_admin: input.mergedByAdmin ?? null,
        is_active: input.isActive ?? true,
        updated_at: new Date().toISOString(),
      }),
    },
  ).catch(() => null)

  if (!res?.ok) return null
  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function loadPlanMergeHistory(countryIso3?: string): Promise<PlanMergeHistoryRow[]> {
  const filters = ['select=*', 'order=created_at.desc', 'limit=5000']
  if (countryIso3) {
    filters.unshift(`country_iso3=eq.${enc(countryIso3.toUpperCase())}`)
  }

  const res = await supabaseRest(`plan_merge_history?${filters.join('&')}`, {
    cache: 'no-store',
  }).catch(() => null)
  if (!res?.ok) {
    const detail = res ? await res.text().catch(() => '') : 'request failed'
    console.error('[history][plan] Failed to load plan_merge_history:', detail)
    return []
  }

  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[]
  return rows.map(mapRow)
}

export async function loadActivePlanMergeHistory(countryIso3?: string): Promise<PlanMergeHistoryRow[]> {
  const filters = ['is_active=eq.true', 'select=*', 'order=created_at.desc', 'limit=5000']
  if (countryIso3) {
    filters.unshift(`country_iso3=eq.${enc(countryIso3.toUpperCase())}`)
  }

  const res = await supabaseRest(`plan_merge_history?${filters.join('&')}`, {
    cache: 'no-store',
  }).catch(() => null)
  if (!res?.ok) {
    const detail = res ? await res.text().catch(() => '') : 'request failed'
    console.error('[history][plan] Failed to load active plan_merge_history:', detail)
    return []
  }

  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[]
  return rows.map(mapRow)
}

export async function patchPlanMergeHistory(
  id: string,
  patch: { isActive?: boolean },
): Promise<PlanMergeHistoryRow | null> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.isActive !== undefined) body.is_active = patch.isActive

  const res = await supabaseRest(`plan_merge_history?id=eq.${enc(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  }).catch(() => null)

  if (!res?.ok) return null
  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function deletePlanMergeHistory(id: string): Promise<boolean> {
  const res = await supabaseRest(`plan_merge_history?id=eq.${enc(id)}`, {
    method: 'DELETE',
  }).catch(() => null)
  return Boolean(res?.ok)
}

type SystemPlanRow = {
  id: string
  system_operator_id?: string | null
  system_plan_name?: string | null
  country_code?: string | null
  normalized_signature?: string | null
}

async function loadSystemPlan(id: string): Promise<SystemPlanRow | null> {
  const res = await supabaseRest(
    `system_plans?id=eq.${enc(id)}&select=id,system_operator_id,system_plan_name,country_code,normalized_signature&limit=1`,
    { cache: 'no-store' },
  ).catch(() => null)
  if (!res?.ok) return null
  const rows = (await res.json().catch(() => [])) as SystemPlanRow[]
  return rows[0] ?? null
}

async function loadOperatorContext(
  systemOperatorId: string,
): Promise<{ countryIso3: string; operatorMergeKey: string; operatorName: string } | null> {
  const res = await supabaseRest(
    `system_operators?id=eq.${enc(systemOperatorId)}&select=system_operator_name,country_id&limit=1`,
    { cache: 'no-store' },
  ).catch(() => null)
  if (!res?.ok) return null
  const rows = (await res.json().catch(() => [])) as Array<{
    system_operator_name?: string
    country_id?: string
  }>
  const row = rows[0]
  if (!row?.country_id) return null

  const countryRes = await supabaseRest(
    `countries?id=eq.${enc(row.country_id)}&select=iso3&limit=1`,
    { cache: 'no-store' },
  ).catch(() => null)
  const countryRows = countryRes?.ok
    ? ((await countryRes.json().catch(() => [])) as Array<{ iso3?: string }>)
    : []
  const countryIso3 = String(countryRows[0]?.iso3 ?? row.country_id).toUpperCase()
  const operatorName = String(row.system_operator_name ?? '').trim()
  if (!operatorName || !countryIso3) return null

  return {
    countryIso3,
    operatorName,
    operatorMergeKey: buildOperatorMergeKey(operatorName),
  }
}

export async function recordPlanMergeHistoryFromSystemMerge(
  targetPlanId: string,
  sourcePlanIds: string[],
  mergedByAdmin?: string | null,
): Promise<void> {
  const targetPlan = await loadSystemPlan(targetPlanId)
  if (!targetPlan?.system_operator_id) return

  const targetContext = await loadOperatorContext(targetPlan.system_operator_id)
  if (!targetContext) return

  const targetSignature = String(targetPlan.normalized_signature ?? '').trim()
  const targetPlanName = String(targetPlan.system_plan_name ?? '').trim()
  if (!targetSignature) return

  for (const sourcePlanId of sourcePlanIds) {
    const sourcePlan = await loadSystemPlan(sourcePlanId)
    if (!sourcePlan?.system_operator_id) continue

    const sourceContext = await loadOperatorContext(sourcePlan.system_operator_id)
    if (!sourceContext) continue

    if (sourceContext.countryIso3 !== targetContext.countryIso3) {
      console.log(
        `[history][skip] Country mismatch source=${sourceContext.countryIso3} target=${targetContext.countryIso3}`,
      )
      continue
    }

    if (sourceContext.operatorMergeKey !== targetContext.operatorMergeKey) {
      console.log(
        `[history][skip] Operator mismatch source=${sourceContext.operatorName} target=${targetContext.operatorName}`,
      )
      continue
    }

    const sourceSignature = String(sourcePlan.normalized_signature ?? '').trim()
    if (!sourceSignature || sourceSignature === targetSignature) continue

    const saved = await upsertPlanMergeHistory({
      countryIso3: targetContext.countryIso3,
      systemOperatorMergeKey: targetContext.operatorMergeKey,
      sourcePlanSignature: sourceSignature,
      targetPlanSignature: targetSignature,
      sourcePlanName: (String(sourcePlan.system_plan_name ?? '').trim()) || sourceSignature,
      targetPlanName: targetPlanName || targetSignature,
      mergeReason: 'ADMIN_MERGE',
      mergedByAdmin: mergedByAdmin ?? null,
      isActive: true,
    })

    if (saved) {
      console.log(
        `[history][plan] Saved merge history source=${saved.sourcePlanName} target=${saved.targetPlanName} country=${saved.countryIso3}`,
      )
    }
  }
}
