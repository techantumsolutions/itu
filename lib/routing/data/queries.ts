/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import type {
  LcrEngineSettings,
  ProviderPriorityRow,
  RoutingLogRow,
  RoutingRuleRow,
  RoutingStrategy,
  FallbackStrategy,
} from '@/lib/routing/types'
import { enc, mapSettings, parseRoutingLogOperatorRef } from './shared'
import { mapRoutingLogRow } from './mapping'

export async function getLcrEngineSettings(): Promise<LcrEngineSettings | null> {
  const res = await supabaseRest('lcr_engine_settings?select=*&order=created_at.asc&limit=1', { cache: 'no-store' })
  if (!res.ok) return null
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0] ? mapSettings(rows[0]) : null
}

export async function listProviderPriorities(): Promise<ProviderPriorityRow[]> {
  const res = await supabaseRest(
    'lcr_providers?select=id,code,name,priority&is_active=eq.true&order=priority.asc',
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    providerId: String(r.id),
    priority: Number(r.priority ?? 100),
    providerCode: String(r.code ?? ''),
    providerName: String(r.name ?? ''),
  }))
}

function mapRule(row: Record<string, unknown>): RoutingRuleRow {
  const prov = row.lcr_providers as { code?: string; name?: string } | null
  return {
    id: String(row.id),
    ruleName: String(row.rule_name ?? ''),
    countryId: row.country_id != null ? String(row.country_id) : null,
    operatorId: row.operator_id != null ? String(row.operator_id) : null,
    productType: row.product_type != null ? String(row.product_type) : null,
    providerId: String(row.provider_id),
    providerCode: prov?.code,
    providerName: prov?.name,
    priority: Number(row.priority ?? 100),
    status: String(row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE',
    effectiveFrom: row.effective_from != null ? String(row.effective_from) : null,
    effectiveTo: row.effective_to != null ? String(row.effective_to) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

export async function listRoutingRules(): Promise<RoutingRuleRow[]> {
  const res = await supabaseRest(
    'routing_rules?select=*,lcr_providers(code,name)&order=priority.asc,created_at.desc',
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as Record<string, unknown>[]
  const rules = rows.map(mapRule)
  return enrichRoutingRulesWithOperatorNames(rules)
}

async function enrichRoutingRulesWithOperatorNames(
  rules: RoutingRuleRow[],
): Promise<RoutingRuleRow[]> {
  if (!rules.length) return rules

  const uuidSet = new Set<string>()
  for (const rule of rules) {
    const { uuid } = parseRoutingLogOperatorRef(rule.operatorId)
    if (uuid) uuidSet.add(uuid)
  }
  if (uuidSet.size === 0) {
    return rules.map((rule) => ({
      ...rule,
      operatorName: rule.operatorId ? rule.operatorId : null,
    }))
  }

  const nameByUuid = new Map<string, string>()
  const uuidList = [...uuidSet]
  for (let i = 0; i < uuidList.length; i += 50) {
    const chunk = uuidList.slice(i, i + 50)
    const opRes = await supabaseRest(
      `system_operators?id=in.(${chunk.map(enc).join(',')})&select=id,system_operator_name,slug`,
      { cache: 'no-store' },
    )
    if (!opRes.ok) continue
    const opRows = (await opRes.json()) as Array<{
      id: string
      system_operator_name?: string | null
      slug?: string | null
    }>
    for (const row of opRows) {
      const name = String(row.system_operator_name ?? row.slug ?? '').trim()
      if (name) nameByUuid.set(String(row.id), name)
    }
  }

  return rules.map((rule) => {
    const { uuid, raw } = parseRoutingLogOperatorRef(rule.operatorId)
    const operatorName =
      (uuid ? nameByUuid.get(uuid) : null) ??
      (raw && !uuid ? raw : null) ??
      null
    return { ...rule, operatorName }
  })
}

export async function getRoutingRule(id: string): Promise<RoutingRuleRow | null> {
  const res = await supabaseRest(
    `routing_rules?id=eq.${enc(id)}&select=*,lcr_providers(code,name)&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0] ? mapRule(rows[0]) : null
}

export async function listActiveRoutingRules(): Promise<RoutingRuleRow[]> {
  const rules = await listRoutingRules()
  const now = Date.now()
  return rules.filter((r) => {
    if (r.status !== 'ACTIVE') return false
    if (r.effectiveFrom && new Date(r.effectiveFrom).getTime() > now) return false
    if (r.effectiveTo && new Date(r.effectiveTo).getTime() < now) return false
    return true
  })
}

export async function listRoutingLogs(filters: {
  countryId?: string
  operatorId?: string
  providerId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}): Promise<{ logs: RoutingLogRow[]; total: number }> {
  const params: string[] = ['select=*,lcr_providers(code,name)', 'order=created_at.desc']
  if (filters.countryId) params.push(`country_id=eq.${enc(filters.countryId)}`)
  if (filters.operatorId) params.push(`operator_id=eq.${enc(filters.operatorId)}`)
  if (filters.providerId) params.push(`provider_id=eq.${enc(filters.providerId)}`)
  if (filters.from) params.push(`created_at=gte.${enc(filters.from)}`)
  if (filters.to) params.push(`created_at=lte.${enc(filters.to)}`)
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0
  params.push(`limit=${limit}`)
  params.push(`offset=${offset}`)

  const res = await supabaseRest(`routing_logs?${params.join('&')}`, {
    cache: 'no-store',
    headers: { Prefer: 'count=exact' },
  })
  if (!res.ok) return { logs: [], total: 0 }

  let totalCount = 0
  const rangeHeader = res.headers.get('content-range')
  if (rangeHeader) {
    const match = rangeHeader.match(/\/(\d+)$/)
    if (match) totalCount = Number(match[1])
  }

  const rows = (await res.json()) as Record<string, unknown>[]
  const logs = rows.map((row) => mapRoutingLogRow(row))

  return { logs, total: totalCount > 0 ? totalCount : logs.length }
}

export async function getMappingCount(internalPlanId: string): Promise<number> {
  const res = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(internalPlanId)}&select=id`,
    { cache: 'no-store', headers: { Prefer: 'count=exact' } }
  )
  if (!res.ok) return 0
  const rangeHeader = res.headers.get('content-range')
  if (rangeHeader) {
    const match = rangeHeader.match(/\/(\d+)$/)
    if (match) return Number(match[1])
  }
  try {
    const rows = await res.json() as any[]
    return rows.length
  } catch {
    return 0
  }
}

export async function listRoutingLogsForTransaction(transactionId: string): Promise<RoutingLogRow[]> {
  const res = await supabaseRest(
    `routing_logs?transaction_id=eq.${enc(transactionId)}&select=*,lcr_providers(code,name)&order=created_at.asc`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows.map((row) => mapRoutingLogRow(row))
}
