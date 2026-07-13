import { supabaseRest } from '@/lib/db/supabase-rest'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_IN_TEXT_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i

export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

/** Extract first UUID embedded in a string (e.g. "Airtel 6d35620e-..."). */
export function extractUuidFromText(value: string | null | undefined): string {
  if (!value) return ''
  const match = value.match(UUID_IN_TEXT_RE)
  return match?.[0] ?? ''
}

/**
 * True when product_name is a placeholder like a bare UUID or "OperatorName <uuid>"
 * written at prepare-checkout instead of the real catalog plan name.
 */
export function isSyntheticPlanProductName(
  productName: string | null | undefined,
  planId?: string | null,
): boolean {
  const name = productName?.trim()
  if (!name || name === '—') return true
  if (looksLikeUuid(name)) return true

  const embedded = extractUuidFromText(name)
  if (embedded) {
    if (planId && embedded.toLowerCase() === planId.trim().toLowerCase()) return true
    const withoutUuid = name.replace(UUID_IN_TEXT_RE, '').trim()
    // Operator prefix + UUID (typical bad prepare-checkout label)
    if (withoutUuid.length > 0 && withoutUuid.length <= 64 && !withoutUuid.includes(' ')) {
      return true
    }
    // "Airtel India <uuid>" style — still synthetic if little remains besides operator words
    if (withoutUuid.length > 0 && withoutUuid.split(/\s+/).length <= 4) {
      return true
    }
  }

  return false
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
  if (meta) {
    for (const key of ['system_plan_id', 'plan_id', 'planId', 'internal_plan_id'] as const) {
      const value = meta[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  const fromProduct = extractUuidFromText(input.productName)
  if (fromProduct) return fromProduct

  return ''
}

export function resolveProductDisplayName(
  productName: string | null | undefined,
  planId: string | null | undefined,
  nameMap: Map<string, string>,
): string {
  const id = (planId?.trim() || extractUuidFromText(productName) || '').trim()
  const catalogName = id && nameMap.has(id) ? nameMap.get(id)!.trim() : ''

  // Always prefer catalog when stored product_name is synthetic (operator + uuid).
  if (catalogName && isSyntheticPlanProductName(productName, id)) {
    return catalogName
  }

  const name = productName?.trim()
  if (name && name !== '—' && !isSyntheticPlanProductName(name, id)) {
    return name
  }

  if (catalogName) return catalogName
  if (name && name !== '—' && !looksLikeUuid(name) && !extractUuidFromText(name)) return name
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
