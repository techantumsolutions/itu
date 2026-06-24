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

type SystemPlanRow = {
  id: string
  internal_plan_id?: string | null
  status?: string | null
  system_plan_name?: string | null
}

function toLink(row: SystemPlanRow, fallbackInternalId: string): ResolvedSystemPlanLink {
  return {
    systemPlanId: row.id,
    internalPlanId: row.internal_plan_id ?? fallbackInternalId,
    systemPlanStatus: row.status ?? null,
    systemPlanName: row.system_plan_name ?? null,
  }
}

/**
 * Resolve catalog system_plan from checkout/runtime plan id.
 * Accepts internal_plans.id OR system_plans.id (admin/products uses system_plans.id).
 */
export async function resolveSystemPlanFromInternalPlan(
  planId: string,
): Promise<ResolvedSystemPlanLink | null> {
  const id = planId?.trim()
  if (!id) return null

  const select = 'id,internal_plan_id,status,system_plan_name'

  const bySystemId = await supabaseRest(
    `system_plans?id=eq.${enc(id)}&select=${select}&limit=1`,
    { cache: 'no-store' },
  )
  if (bySystemId.ok) {
    const rows = (await bySystemId.json()) as SystemPlanRow[]
    if (rows[0]?.id) return toLink(rows[0], id)
  }

  const byInternalId = await supabaseRest(
    `system_plans?internal_plan_id=eq.${enc(id)}&select=${select}&limit=1`,
    { cache: 'no-store' },
  )
  if (!byInternalId.ok) return null

  const rows = (await byInternalId.json()) as SystemPlanRow[]
  const row = rows[0]
  if (!row?.id) return null

  return toLink(row, id)
}
