import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type ResolvedSystemPlanLink = {
  systemPlanId: string
  internalPlanId: string
  systemPlanStatus: string | null
  systemPlanName: string | null
}

/** Resolve catalog system_plan from checkout/runtime internal_plan_id. */
export async function resolveSystemPlanFromInternalPlan(
  internalPlanId: string,
): Promise<ResolvedSystemPlanLink | null> {
  const id = internalPlanId?.trim()
  if (!id) return null

  const res = await supabaseRest(
    `system_plans?internal_plan_id=eq.${enc(id)}&select=id,internal_plan_id,status,system_plan_name&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null

  const rows = (await res.json()) as Array<{
    id: string
    internal_plan_id?: string | null
    status?: string | null
    system_plan_name?: string | null
  }>
  const row = rows[0]
  if (!row?.id) return null

  return {
    systemPlanId: row.id,
    internalPlanId: row.internal_plan_id ?? id,
    systemPlanStatus: row.status ?? null,
    systemPlanName: row.system_plan_name ?? null,
  }
}
