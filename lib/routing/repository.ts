import { supabaseRest } from '@/lib/db/supabase-rest'
import type {
  LcrEngineSettings,
  ProviderPriorityRow,
  RoutingLogRow,
  RoutingRuleRow,
  RoutingStrategy,
  FallbackStrategy,
} from '@/lib/routing/types'

function enc(v: string): string {
  return encodeURIComponent(v)
}

let schemaReadyCache: boolean | null = null
let schemaReadyCheckedAt = 0

export async function isRoutingEngineSchemaReady(): Promise<boolean> {
  const now = Date.now()
  if (schemaReadyCache != null && now - schemaReadyCheckedAt < 30_000) return schemaReadyCache
  const res = await supabaseRest('lcr_engine_settings?select=id&limit=1', { cache: 'no-store' })
  schemaReadyCache = res.ok
  schemaReadyCheckedAt = now
  return schemaReadyCache
}

function mapSettings(row: Record<string, unknown>): LcrEngineSettings {
  return {
    id: String(row.id),
    enabled: Boolean(row.enabled),
    routingStrategy: String(row.routing_strategy ?? 'LEAST_COST') as RoutingStrategy,
    fallbackStrategy: String(row.fallback_strategy ?? 'NEXT_PROVIDER') as FallbackStrategy,
    autoFailover: Boolean(row.auto_failover),
    retryEnabled: Boolean(row.retry_enabled),
    retryAttempts: Number(row.retry_attempts ?? 2),
  }
}

export async function getLcrEngineSettings(): Promise<LcrEngineSettings | null> {
  const res = await supabaseRest('lcr_engine_settings?select=*&order=created_at.asc&limit=1', { cache: 'no-store' })
  if (!res.ok) return null
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0] ? mapSettings(rows[0]) : null
}

export async function upsertLcrEngineSettings(input: Partial<LcrEngineSettings>): Promise<LcrEngineSettings | null> {
  const existing = await getLcrEngineSettings()
  const payload: Record<string, unknown> = {}
  if (input.enabled !== undefined) payload.enabled = input.enabled
  if (input.routingStrategy !== undefined) payload.routing_strategy = input.routingStrategy
  if (input.fallbackStrategy !== undefined) payload.fallback_strategy = input.fallbackStrategy
  if (input.autoFailover !== undefined) payload.auto_failover = input.autoFailover
  if (input.retryEnabled !== undefined) payload.retry_enabled = input.retryEnabled
  if (input.retryAttempts !== undefined) payload.retry_attempts = input.retryAttempts

  const res = existing
    ? await supabaseRest(`lcr_engine_settings?id=eq.${enc(existing.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      })
    : await supabaseRest('lcr_engine_settings', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          enabled: true,
          routing_strategy: 'LEAST_COST',
          fallback_strategy: 'NEXT_PROVIDER',
          auto_failover: true,
          retry_enabled: true,
          retry_attempts: 2,
          ...payload,
        }),
      })

  if (!res.ok) return null
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0] ? mapSettings(rows[0]) : null
}

export async function listProviderPriorities(): Promise<ProviderPriorityRow[]> {
  const res = await supabaseRest(
    'provider_priorities?select=id,provider_id,priority,lcr_providers(code,name)&order=priority.asc',
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as Array<Record<string, unknown>>
  return rows.map((r) => {
    const prov = r.lcr_providers as { code?: string; name?: string } | null
    return {
      id: String(r.id),
      providerId: String(r.provider_id),
      priority: Number(r.priority ?? 100),
      providerCode: prov?.code,
      providerName: prov?.name,
    }
  })
}

export async function replaceProviderPriorities(
  items: Array<{ providerId: string; priority: number }>,
): Promise<ProviderPriorityRow[]> {
  for (const item of items) {
    const res = await supabaseRest(
      `provider_priorities?provider_id=eq.${enc(item.providerId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ priority: item.priority }),
      },
    )
    if (!res.ok) {
      await supabaseRest('provider_priorities', {
        method: 'POST',
        body: JSON.stringify({ provider_id: item.providerId, priority: item.priority }),
      })
    }
  }
  return listProviderPriorities()
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
  return rows.map(mapRule)
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

export async function createRoutingRule(input: {
  ruleName: string
  countryId?: string | null
  operatorId?: string | null
  productType?: string | null
  providerId: string
  priority?: number
  status?: 'ACTIVE' | 'INACTIVE'
  effectiveFrom?: string | null
  effectiveTo?: string | null
}): Promise<RoutingRuleRow | null> {
  const res = await supabaseRest('routing_rules', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      rule_name: input.ruleName,
      country_id: input.countryId ?? null,
      operator_id: input.operatorId ?? null,
      product_type: input.productType ?? null,
      provider_id: input.providerId,
      priority: input.priority ?? 100,
      status: input.status ?? 'ACTIVE',
      effective_from: input.effectiveFrom ?? null,
      effective_to: input.effectiveTo ?? null,
    }),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0] ? getRoutingRule(String(rows[0].id)) : null
}

export async function updateRoutingRule(
  id: string,
  input: Partial<{
    ruleName: string
    countryId: string | null
    operatorId: string | null
    productType: string | null
    providerId: string
    priority: number
    status: 'ACTIVE' | 'INACTIVE'
    effectiveFrom: string | null
    effectiveTo: string | null
  }>,
): Promise<RoutingRuleRow | null> {
  const payload: Record<string, unknown> = {}
  if (input.ruleName !== undefined) payload.rule_name = input.ruleName
  if (input.countryId !== undefined) payload.country_id = input.countryId
  if (input.operatorId !== undefined) payload.operator_id = input.operatorId
  if (input.productType !== undefined) payload.product_type = input.productType
  if (input.providerId !== undefined) payload.provider_id = input.providerId
  if (input.priority !== undefined) payload.priority = input.priority
  if (input.status !== undefined) payload.status = input.status
  if (input.effectiveFrom !== undefined) payload.effective_from = input.effectiveFrom
  if (input.effectiveTo !== undefined) payload.effective_to = input.effectiveTo

  const res = await supabaseRest(`routing_rules?id=eq.${enc(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return getRoutingRule(id)
}

export async function deleteRoutingRule(id: string): Promise<boolean> {
  const res = await supabaseRest(`routing_rules?id=eq.${enc(id)}`, { method: 'DELETE' })
  return res.ok
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

export async function insertRoutingLog(input: {
  transactionId?: string
  countryId?: string
  operatorId?: string
  productId?: string
  providerId?: string
  routingType: 'RULE' | 'LCR'
  providerCost?: number
  fallbackUsed?: boolean
  status?: string
}): Promise<string | null> {
  const res = await supabaseRest('routing_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      transaction_id: input.transactionId ?? null,
      country_id: input.countryId ?? null,
      operator_id: input.operatorId ?? null,
      product_id: input.productId ?? null,
      provider_id: input.providerId ?? null,
      routing_type: input.routingType,
      provider_cost: input.providerCost ?? null,
      fallback_used: input.fallbackUsed ?? false,
      status: input.status ?? 'SELECTED',
    }),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id?: string }>
  return rows[0]?.id ?? null
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

  const res = await supabaseRest(`routing_logs?${params.join('&')}`, { cache: 'no-store' })
  if (!res.ok) return { logs: [], total: 0 }

  const rows = (await res.json()) as Record<string, unknown>[]
  const logs: RoutingLogRow[] = rows.map((row) => {
    const prov = row.lcr_providers as { code?: string; name?: string } | null
    return {
      id: String(row.id),
      transactionId: row.transaction_id != null ? String(row.transaction_id) : null,
      countryId: row.country_id != null ? String(row.country_id) : null,
      operatorId: row.operator_id != null ? String(row.operator_id) : null,
      productId: row.product_id != null ? String(row.product_id) : null,
      providerId: row.provider_id != null ? String(row.provider_id) : null,
      providerCode: prov?.code,
      providerName: prov?.name,
      routingType: String(row.routing_type ?? 'LCR') as 'RULE' | 'LCR',
      providerCost: row.provider_cost != null ? Number(row.provider_cost) : null,
      fallbackUsed: Boolean(row.fallback_used),
      status: String(row.status ?? 'SELECTED'),
      createdAt: String(row.created_at ?? ''),
    }
  })

  return { logs, total: logs.length }
}
