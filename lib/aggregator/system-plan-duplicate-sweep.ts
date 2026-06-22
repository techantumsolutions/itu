import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggMergeSystemPlans } from '@/lib/aggregator/repository'
import {
  groupEquivalentDisplayPlans,
  groupPlansByDisplayName,
  pickCanonicalMergeTargetPlan,
  type SystemPlanMergeRow,
} from '@/lib/aggregator/plan-display-merge'

const ACTOR = 'system-plans-duplicate-worker'

const PLAN_SELECT =
  'id,system_operator_id,system_plan_name,country_code,amount,currency,validity,data_volume,sms,talktime,plan_type,normalized_signature,status,created_at,internal_plan_id'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type SystemPlanDuplicateSweepResult = {
  operatorsScanned: number
  plansScanned: number
  duplicateGroupsFound: number
  plansMerged: number
  mergeRounds: number
}

async function mergeSystemPlanGroups(
  groups: Map<string, SystemPlanMergeRow[]>,
  logLabel: string,
): Promise<{ merged: number; groupsFound: number }> {
  let merged = 0
  let groupsFound = 0

  for (const plans of groups.values()) {
    if (plans.length < 2) continue
    groupsFound++

    const target = pickCanonicalMergeTargetPlan(plans)
    if (!target?.id) continue

    const sources = plans
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id) && id !== target.id)
    if (!sources.length) continue

    try {
      const result = await aggMergeSystemPlans(target.id, sources, ACTOR)
      if (result.success) merged += sources.length
    } catch (err) {
      console.error(`[${ACTOR}] merge failed (${logLabel}):`, err)
    }
  }

  return { merged, groupsFound }
}

function groupPlansBySignature(plans: SystemPlanMergeRow[]): Map<string, SystemPlanMergeRow[]> {
  const groups = new Map<string, SystemPlanMergeRow[]>()
  for (const plan of plans) {
    const signature = String(plan.normalized_signature ?? '').trim()
    const operatorId = String(plan.system_operator_id ?? '').trim()
    const countryCode = (String(plan.country_code ?? 'UNK').trim().toUpperCase()) || 'UNK'
    if (!signature || !operatorId) continue
    const key = `${countryCode}:${operatorId}:${signature}`
    if (!groups.has(key)) groups.set(key, [])
    const bucket = groups.get(key)!
    if (!bucket.some((row) => row.id === plan.id)) bucket.push(plan)
  }
  return groups
}

async function fetchOperatorIds(): Promise<string[]> {
  const ids = new Set<string>()
  let offset = 0
  const limit = 1000

  while (true) {
    const res = await supabaseRest(
      `system_plans?select=system_operator_id&order=system_operator_id.asc&limit=${limit}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const rows = (await res.json()) as Array<{ system_operator_id?: string | null }>
    for (const row of rows) {
      if (row.system_operator_id) ids.add(row.system_operator_id)
    }
    if (rows.length < limit) break
    offset += limit
  }

  return [...ids]
}

async function fetchPlansForOperator(operatorId: string): Promise<SystemPlanMergeRow[]> {
  const plans: SystemPlanMergeRow[] = []
  let offset = 0
  const limit = 1000

  while (true) {
    const res = await supabaseRest(
      `system_plans?system_operator_id=eq.${enc(operatorId)}&select=${PLAN_SELECT}&order=created_at.asc&limit=${limit}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const rows = (await res.json()) as SystemPlanMergeRow[]
    plans.push(...rows)
    if (rows.length < limit) break
    offset += limit
  }

  return plans
}

async function mergeOperatorDuplicates(operatorId: string): Promise<{
  plansScanned: number
  duplicateGroupsFound: number
  plansMerged: number
  mergeRounds: number
}> {
  let plansScanned = 0
  let duplicateGroupsFound = 0
  let plansMerged = 0
  let mergeRounds = 0

  for (let round = 0; round < 8; round++) {
    const plans = await fetchPlansForOperator(operatorId)
    plansScanned = Math.max(plansScanned, plans.length)
    if (plans.length < 2) break

    const displayName = await mergeSystemPlanGroups(groupPlansByDisplayName(plans), 'display-name')
    const displayPrice = await mergeSystemPlanGroups(
      groupEquivalentDisplayPlans(plans),
      'display-price',
    )
    const signature = await mergeSystemPlanGroups(groupPlansBySignature(plans), 'signature')

    const roundMerged = displayName.merged + displayPrice.merged + signature.merged
    duplicateGroupsFound +=
      displayName.groupsFound + displayPrice.groupsFound + signature.groupsFound

    if (roundMerged === 0) break

    plansMerged += roundMerged
    mergeRounds++
  }

  return { plansScanned, duplicateGroupsFound, plansMerged, mergeRounds }
}

/**
 * Scan all system_operators and merge duplicate system_plans in-place.
 * Keeps the oldest plan (created_at) as canonical.
 */
export async function sweepDuplicateSystemPlans(): Promise<SystemPlanDuplicateSweepResult> {
  const operatorIds = await fetchOperatorIds()
  const result: SystemPlanDuplicateSweepResult = {
    operatorsScanned: 0,
    plansScanned: 0,
    duplicateGroupsFound: 0,
    plansMerged: 0,
    mergeRounds: 0,
  }

  for (const operatorId of operatorIds) {
    const operatorResult = await mergeOperatorDuplicates(operatorId)
    if (operatorResult.plansMerged === 0 && operatorResult.plansScanned < 2) continue

    result.operatorsScanned++
    result.plansScanned += operatorResult.plansScanned
    result.duplicateGroupsFound += operatorResult.duplicateGroupsFound
    result.plansMerged += operatorResult.plansMerged
    result.mergeRounds += operatorResult.mergeRounds

    if (operatorResult.plansMerged > 0) {
      console.log(
        `[${ACTOR}] operator=${operatorId} merged=${operatorResult.plansMerged} plans (rounds=${operatorResult.mergeRounds})`,
      )
    }
  }

  return result
}
