import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

const INACTIVE_REASON = 'NO_PROVIDER_MAPPING'

async function fetchAllPaginated<T>(buildUrl: (offset: number, limit: number) => string): Promise<T[]> {
  const limit = 1000
  let offset = 0
  const rows: T[] = []

  while (true) {
    const res = await supabaseRest(buildUrl(offset, limit), { cache: 'no-store' })
    if (!res.ok) throw new Error(await res.text())
    const page = (await res.json()) as T[]
    rows.push(...page)
    if (page.length < limit) break
    offset += limit
  }

  return rows
}

/**
 * Deactivate ACTIVE system_plans with zero plan_mappings (after Step7, before Step8).
 */
export async function deactivateSystemPlansWithoutMappings(): Promise<{
  scanned: number
  deactivated: number
}> {
  const mappedPlanIds = new Set<string>()
  const mappings = await fetchAllPaginated<{ system_plan_id: string }>((offset, limit) =>
    `plan_mappings?select=system_plan_id&limit=${limit}&offset=${offset}`,
  )
  for (const row of mappings) {
    if (row.system_plan_id) mappedPlanIds.add(row.system_plan_id)
  }

  const activePlans = await fetchAllPaginated<{
    id: string
    internal_plan_id?: string | null
  }>((offset, limit) =>
    `system_plans?status=eq.ACTIVE&select=id,internal_plan_id&limit=${limit}&offset=${offset}`,
  )

  let deactivated = 0
  for (const plan of activePlans) {
    if (mappedPlanIds.has(plan.id)) continue

    const patchRes = await supabaseRest(`system_plans?id=eq.${enc(plan.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'INACTIVE',
        catalog_status: INACTIVE_REASON,
      }),
    })
    if (!patchRes.ok) continue

    deactivated++
    if (plan.internal_plan_id) {
      await supabaseRest(`internal_plans?id=eq.${enc(plan.internal_plan_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      }).catch(() => {})
    }
  }

  return { scanned: activePlans.length, deactivated }
}
