import { supabaseRest } from '@/lib/db/supabase-rest'
import { filterWebsiteEligibleSystemPlans } from '@/lib/catalog/website-plan-eligibility'
import { isMobileCatalogPlan } from '@/lib/catalog/mobile-catalog-filter'

function enc(v: string): string {
  return encodeURIComponent(v)
}

type SystemPlanRow = {
  id: string
  system_operator_id?: string | null
  system_plan_name?: string | null
  country_code?: string | null
  status?: string | null
  service_domain?: string | null
}

export type SyncVerificationDashboard = {
  totalSystemPlans: number
  duplicatePlansFound: number
  duplicatePlansMerged: number
  activePlans: number
  inactivePlans: number
  websiteEligiblePlans: number
}

async function fetchAllSystemPlans(): Promise<SystemPlanRow[]> {
  const rows: SystemPlanRow[] = []
  let offset = 0
  const limit = 1000

  while (true) {
    const res = await supabaseRest(
      `system_plans?select=id,system_operator_id,system_plan_name,country_code,status,service_domain&order=created_at.asc&limit=${limit}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const page = (await res.json()) as SystemPlanRow[]
    rows.push(...page)
    if (page.length < limit) break
    offset += limit
  }

  return rows
}

function countNameOperatorCountryDuplicates(plans: SystemPlanRow[]): number {
  const groups = new Map<string, number>()
  for (const plan of plans) {
    const country = (String(plan.country_code ?? 'UNK').trim().toUpperCase()) || 'UNK'
    const operatorId = String(plan.system_operator_id ?? '').trim()
    const name = String(plan.system_plan_name ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
    if (!operatorId || !name) continue
    const key = `${country}:${operatorId}:${name}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }

  let duplicatePlans = 0
  for (const count of groups.values()) {
    if (count > 1) duplicatePlans += count - 1
  }
  return duplicatePlans
}

async function countWebsiteEligiblePlans(plans: SystemPlanRow[]): Promise<number> {
  const activeMobilePlans = plans.filter(
    (plan) =>
      String(plan.status ?? '').toUpperCase() === 'ACTIVE' && isMobileCatalogPlan(plan),
  )

  const byOperator = new Map<string, SystemPlanRow[]>()
  for (const plan of activeMobilePlans) {
    const operatorId = String(plan.system_operator_id ?? '').trim()
    if (!operatorId) continue
    const list = byOperator.get(operatorId) ?? []
    list.push(plan)
    byOperator.set(operatorId, list)
  }

  let eligible = 0
  for (const [operatorId, operatorPlans] of byOperator.entries()) {
    const filtered = await filterWebsiteEligibleSystemPlans(operatorPlans, operatorId)
    eligible += filtered.length
  }
  return eligible
}

export async function calculateSyncVerificationDashboard(input?: {
  duplicatePlansMerged?: number
}): Promise<SyncVerificationDashboard> {
  const plans = await fetchAllSystemPlans()
  const activePlans = plans.filter((plan) => String(plan.status ?? '').toUpperCase() === 'ACTIVE').length
  const inactivePlans = plans.length - activePlans
  const websiteEligiblePlans = await countWebsiteEligiblePlans(plans)

  return {
    totalSystemPlans: plans.length,
    duplicatePlansFound: countNameOperatorCountryDuplicates(plans),
    duplicatePlansMerged: input?.duplicatePlansMerged ?? 0,
    activePlans,
    inactivePlans,
    websiteEligiblePlans,
  }
}
