import { supabaseRest } from '@/lib/db/supabase-rest'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

export function extractPlanIdFromSources(input: {
  planId?: string | null
  skuCode?: string | null
  productName?: string | null
  metadata?: Record<string, unknown> | null
}): string {
  const fromRow = input.planId?.trim() || input.skuCode?.trim()
  if (fromRow) return fromRow

  const meta = input.metadata
  if (!meta) return ''

  for (const key of ['system_plan_id', 'plan_id', 'planId'] as const) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return ''
}

export function resolveProductDisplayName(
  productName: string | null | undefined,
  planId: string | null | undefined,
  nameMap: Map<string, string>,
): string {
  const name = productName?.trim()
  if (name && name !== '—' && !looksLikeUuid(name)) return name

  const id = planId?.trim()
  if (id && nameMap.has(id)) return nameMap.get(id)!

  if (name && name !== '—') return name
  if (id) return id

  return 'Recharge Plan'
}

export async function resolvePlanNameMap(planIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(planIds.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return map

  const chunkSize = 80
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const inList = chunk.map(encodeURIComponent).join(',')

    const [systemRes, internalRes, systemByInternalRes] = await Promise.all([
      supabaseRest(`system_plans?id=in.(${inList})&select=id,system_plan_name`, { cache: 'no-store' }),
      supabaseRest(`internal_plans?id=in.(${inList})&select=id,uti_plan_name`, { cache: 'no-store' }),
      supabaseRest(
        `system_plans?internal_plan_id=in.(${inList})&select=internal_plan_id,system_plan_name`,
        { cache: 'no-store' },
      ),
    ])

    if (systemRes.ok) {
      const rows = (await systemRes.json()) as Array<{ id: string; system_plan_name?: string | null }>
      for (const row of rows) {
        const label = row.system_plan_name?.trim()
        if (row.id && label) map.set(row.id, label)
      }
    }

    if (internalRes.ok) {
      const rows = (await internalRes.json()) as Array<{ id: string; uti_plan_name?: string | null }>
      for (const row of rows) {
        const label = row.uti_plan_name?.trim()
        if (row.id && label && !map.has(row.id)) map.set(row.id, label)
      }
    }

    if (systemByInternalRes.ok) {
      const rows = (await systemByInternalRes.json()) as Array<{
        internal_plan_id?: string | null
        system_plan_name?: string | null
      }>
      for (const row of rows) {
        const id = row.internal_plan_id?.trim()
        const label = row.system_plan_name?.trim()
        if (id && label && !map.has(id)) map.set(id, label)
      }
    }
  }

  return map
}
