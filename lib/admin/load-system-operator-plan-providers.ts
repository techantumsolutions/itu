import { supabaseRest } from '@/lib/db/supabase-rest'

/** Providers linked to each system operator via system_plans + plan_mappings. */
export async function loadProviderIdsBySystemOperatorFromPlans(): Promise<Map<string, string[]>> {
  const byOperator = new Map<string, Set<string>>()

  try {
    const [plansRes, mappingsRes] = await Promise.all([
      supabaseRest('system_plans?select=id,system_operator_id&limit=50000', { cache: 'no-store' }),
      supabaseRest('plan_mappings?select=system_plan_id,service_provider_id&limit=50000', { cache: 'no-store' }),
    ])
    if (!plansRes.ok || !mappingsRes.ok) return new Map()

    const plans = (await plansRes.json()) as Array<{ id?: string; system_operator_id?: string }>
    const mappings = (await mappingsRes.json()) as Array<{
      system_plan_id?: string
      service_provider_id?: string
    }>

    const planToOperator = new Map<string, string>()
    for (const plan of plans) {
      const planId = String(plan.id ?? '').trim()
      const operatorId = String(plan.system_operator_id ?? '').trim()
      if (planId && operatorId) planToOperator.set(planId, operatorId)
    }

    for (const mapping of mappings) {
      const planId = String(mapping.system_plan_id ?? '').trim()
      const providerId = String(mapping.service_provider_id ?? '').trim()
      const operatorId = planToOperator.get(planId)
      if (!operatorId || !providerId) continue
      if (!byOperator.has(operatorId)) byOperator.set(operatorId, new Set())
      byOperator.get(operatorId)!.add(providerId)
    }
  } catch {
    return new Map()
  }

  return new Map(
    [...byOperator.entries()].map(([operatorId, providerIds]) => [operatorId, [...providerIds]]),
  )
}
