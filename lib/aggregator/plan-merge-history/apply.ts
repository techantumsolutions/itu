import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggMergeSystemPlans } from '@/lib/aggregator/repository'
import { buildOperatorMergeKey, buildPlanHistoryLookupKey, normalizePlanSignature } from './keys'
import { loadActivePlanMergeHistory } from './repository'
import { pickMergeTargetPlan } from '@/lib/aggregator/plan-display-merge'
import { normalizePlanNameForHistory } from '@/lib/aggregator/merge-keys'
import type { PlanMergeHistoryApplyResult, PlanMergeHistoryRow } from './types'

function enc(value: string): string {
  return encodeURIComponent(value)
}

const PAGE_SIZE = 1000

type SystemPlanRow = {
  id: string
  system_operator_id?: string | null
  system_plan_name?: string | null
  country_code?: string | null
  normalized_signature?: string | null
  internal_plan_id?: string | null
  status?: string | null
  validity?: string | null
  data_volume?: string | null
  sms?: string | null
  talktime?: string | null
  plan_type?: string | null
}

type OperatorRow = {
  id: string
  system_operator_name?: string | null
  country_id?: string | null
}

async function fetchAllRows<T>(path: string): Promise<T[]> {
  const rows: T[] = []
  let offset = 0

  while (true) {
    const res = await supabaseRest(`${path}&limit=${PAGE_SIZE}&offset=${offset}`, {
      cache: 'no-store',
    })
    if (!res.ok) break
    const page = (await res.json()) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

async function loadMappedOperatorIds(providerId: string): Promise<string[]> {
  const mappings = await fetchAllRows<{ system_plan_id?: string | null }>(
    `plan_mappings?service_provider_id=eq.${enc(providerId)}&select=system_plan_id`,
  )
  const mappedPlanIds = Array.from(
    new Set(mappings.map((row) => row.system_plan_id).filter((id): id is string => Boolean(id))),
  )
  if (!mappedPlanIds.length) return []

  const operatorIds = new Set<string>()
  for (let i = 0; i < mappedPlanIds.length; i += 100) {
    const chunk = mappedPlanIds.slice(i, i + 100)
    const res = await supabaseRest(
      `system_plans?id=in.(${chunk.map(enc).join(',')})&select=system_operator_id`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{ system_operator_id?: string | null }>
    for (const row of rows) {
      if (row.system_operator_id) operatorIds.add(row.system_operator_id)
    }
  }

  return [...operatorIds]
}

async function fetchSystemPlansForOperators(operatorIds: string[]): Promise<SystemPlanRow[]> {
  const plans: SystemPlanRow[] = []
  for (let i = 0; i < operatorIds.length; i += 50) {
    const chunk = operatorIds.slice(i, i + 50)
    const rows = await fetchAllRows<SystemPlanRow>(
      `system_plans?system_operator_id=in.(${chunk.map(enc).join(',')})&select=id,system_operator_id,system_plan_name,country_code,normalized_signature,internal_plan_id,status,validity,data_volume,sms,talktime,plan_type`,
    )
    plans.push(...rows)
  }
  return plans
}

async function loadOperators(operatorIds: string[]): Promise<Map<string, OperatorRow>> {
  const map = new Map<string, OperatorRow>()
  for (let i = 0; i < operatorIds.length; i += 100) {
    const chunk = operatorIds.slice(i, i + 100)
    const res = await supabaseRest(
      `system_operators?id=in.(${chunk.map(enc).join(',')})&select=id,system_operator_name,country_id`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as OperatorRow[]
    for (const row of rows) {
      if (row.id) map.set(row.id, row)
    }
  }
  return map
}

function resolveCountryIso3(
  planCountryCode: string | null | undefined,
  operatorCountryId: string | null | undefined,
): string | null {
  const fromPlan = String(planCountryCode ?? '').trim().toUpperCase()
  if (fromPlan && fromPlan.length === 3) return fromPlan

  const fromOperator = String(operatorCountryId ?? '').trim().toUpperCase()
  return fromOperator || null
}

function planMatchesHistorySource(plan: SystemPlanRow, rule: PlanMergeHistoryRow): boolean {
  const signature = normalizePlanSignature(plan.normalized_signature)
  const ruleSignature = normalizePlanSignature(rule.sourcePlanSignature)
  if (signature && ruleSignature && signature.toLowerCase() === ruleSignature.toLowerCase()) {
    return true
  }

  const planName = normalizePlanNameForHistory(plan.system_plan_name)
  const ruleName = normalizePlanNameForHistory(rule.sourcePlanName)
  return Boolean(planName && ruleName && planName === ruleName)
}

function planMatchesHistoryTarget(plan: SystemPlanRow, rule: PlanMergeHistoryRow): boolean {
  const signature = normalizePlanSignature(plan.normalized_signature)
  const ruleSignature = normalizePlanSignature(rule.targetPlanSignature)
  if (signature && ruleSignature && signature.toLowerCase() === ruleSignature.toLowerCase()) {
    return true
  }

  const planName = normalizePlanNameForHistory(plan.system_plan_name)
  const ruleName = normalizePlanNameForHistory(rule.targetPlanName)
  return Boolean(planName && ruleName && planName === ruleName)
}

function planBelongsToRule(
  plan: SystemPlanRow,
  rule: PlanMergeHistoryRow,
  operators: Map<string, OperatorRow>,
): boolean {
  const operatorId = String(plan.system_operator_id ?? '').trim()
  const operator = operators.get(operatorId)
  if (!operator) return false

  const countryIso3 = resolveCountryIso3(plan.country_code, operator.country_id)
  if (!countryIso3 || countryIso3 !== rule.countryIso3) return false

  const operatorMergeKey = buildOperatorMergeKey(String(operator.system_operator_name ?? ''))
  const ruleOperatorKey = buildOperatorMergeKey(rule.systemOperatorMergeKey)
  return mergeOperatorKeys(operatorMergeKey, ruleOperatorKey)
}

function mergeOperatorKeys(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase()
}

export async function applyPlanMergeHistoryForProvider(
  providerId: string,
  actorEmail: string = 'system-sync',
): Promise<PlanMergeHistoryApplyResult> {
  const historyRows = await loadActivePlanMergeHistory()
  if (!historyRows.length) {
    console.log('[history][plan] No active plan merge history rules found')
    return { applied: 0, skipped: 0, merged: 0 }
  }

  const operatorIds = await loadMappedOperatorIds(providerId)
  if (!operatorIds.length) return { applied: 0, skipped: 0, merged: 0 }

  const [plans, operators] = await Promise.all([
    fetchSystemPlansForOperators(operatorIds),
    loadOperators(operatorIds),
  ])

  const plansByTarget = new Map<string, string[]>()
  let skipped = 0

  for (const rule of historyRows) {
    const scopedPlans = plans.filter((plan) => planBelongsToRule(plan, rule, operators))
    if (!scopedPlans.length) continue

    const targetCandidates = scopedPlans.filter((plan) => planMatchesHistoryTarget(plan, rule))
    const sourceCandidates = scopedPlans.filter(
      (plan) =>
        planMatchesHistorySource(plan, rule) &&
        !planMatchesHistoryTarget(plan, rule),
    )

    if (!targetCandidates.length) {
      console.log(
        `[history][skip] Target plan not found source=${rule.sourcePlanName} target=${rule.targetPlanName} country=${rule.countryIso3}`,
      )
      skipped++
      continue
    }

    if (!sourceCandidates.length) continue

    const target = pickMergeTargetPlan(targetCandidates) ?? targetCandidates[0]
    if (!target?.id) continue

    for (const source of sourceCandidates) {
      if (source.id === target.id) continue
      if (!plansByTarget.has(target.id)) plansByTarget.set(target.id, [])
      const bucket = plansByTarget.get(target.id)!
      if (!bucket.includes(source.id)) bucket.push(source.id)
    }

    console.log(
      `[history][plan] Applied merge history source=${rule.sourcePlanName} target=${rule.targetPlanName} country=${rule.countryIso3}`,
    )
  }

  let merged = 0
  let applied = 0

  for (const [targetId, sourceIds] of plansByTarget) {
    if (!sourceIds.length) continue
    applied++

    try {
      const result = await aggMergeSystemPlans(targetId, sourceIds, actorEmail)
      if (result.success) merged += sourceIds.length
    } catch (err) {
      console.error('[history][plan] Failed to apply merge history:', err)
      skipped += sourceIds.length
    }
  }

  return { applied, skipped, merged }
}

// Keep lookup helper exported for tests/diagnostics
export { buildPlanHistoryLookupKey }
