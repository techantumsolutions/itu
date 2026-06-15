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

export async function replaceProviderPriorities(
  items: Array<{ providerId: string; priority: number }>,
): Promise<ProviderPriorityRow[]> {
  for (const item of items) {
    await supabaseRest(
      `lcr_providers?id=eq.${enc(item.providerId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ priority: item.priority }),
      },
    )
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

export async function insertDetailedRoutingLog(input: {
  transactionId: string
  countryCode: string
  operatorCode: string
  planId: string
  routingStrategy: string
  routingRuleMatched: 'Yes' | 'No'
  routingRuleId?: string | null
  routingRuleProvider?: string | null
  selectedProvider?: string | null
  attemptNumber?: number
  providerCost?: number
  providerPriority?: number
  executionResult: string
  failureReason?: string | null
  responseCode?: string | null
  responseMessage?: string | null
  verificationMappingCount?: number | null
}): Promise<string | null> {
  const details = {
    routingStrategy: input.routingStrategy,
    routingRuleMatched: input.routingRuleMatched,
    routingRuleId: input.routingRuleId ?? null,
    routingRuleProvider: input.routingRuleProvider ?? null,
    attemptNumber: input.attemptNumber ?? null,
    providerPriority: input.providerPriority ?? null,
    failureReason: input.failureReason ?? null,
    responseCode: input.responseCode ?? null,
    responseMessage: input.responseMessage ?? null,
    verificationMappingCount: input.verificationMappingCount ?? null,
  }

  const res = await supabaseRest('routing_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      transaction_id: input.transactionId,
      country_id: input.countryCode,
      operator_id: input.operatorCode,
      product_id: input.planId,
      provider_id: input.selectedProvider || null,
      routing_type: input.routingRuleMatched === 'Yes' ? 'RULE' : 'LCR',
      provider_cost: input.providerCost ?? null,
      fallback_used: (input.attemptNumber ?? 1) > 1,
      status: JSON.stringify({
        event: input.executionResult,
        ...details
      })
    })
  })

  if (!res.ok) return null
  try {
    const rows = (await res.json()) as Array<{ id?: string }>
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}

function parseRoutingLogStatus(status: string): Record<string, unknown> {
  try {
    if (status && status.startsWith('{')) {
      return JSON.parse(status) as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return { event: status }
}

export async function listRoutingLogsForTransaction(transactionId: string): Promise<RoutingLogRow[]> {
  const res = await supabaseRest(
    `routing_logs?transaction_id=eq.${enc(transactionId)}&select=*,lcr_providers(code,name)&order=created_at.asc`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows.map((row) => {
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
}

export type RoutingAuditDetail = {
  id: string
  distributor_ref: string
  internal_plan_id: string | null
  status: 'success' | 'failed'
  routing_decision: Record<string, unknown>
  attempts: Array<{
    providerName: string
    cost: number | null
    source: 'RULE' | 'LCR'
    ok: boolean
    error?: string
    errorCode?: string
    errorMessage?: string
  }>
}

export function buildRoutingAuditDetailFromLogs(logs: RoutingLogRow[]): RoutingAuditDetail | null {
  if (!logs.length) return null

  const parsed = logs.map((log) => ({
    log,
    meta: parseRoutingLogStatus(log.status),
    event: String(parseRoutingLogStatus(log.status).event ?? log.status),
  }))

  const first = logs[0]
  const transactionId = first.transactionId ?? first.id

  let routingStrategy = 'LEAST_COST'
  let routingRuleMatched = false
  let routingRuleProvider: string | null = null
  let routingDecisionReason: string | null = null
  let mappingCount = 0
  let selectedProvider: string | null = null

  const evaluatedMap = new Map<
    string,
    {
      providerId: string
      providerName: string
      costPrice: number | null
      margin: number | null
      priority: number | null
      eligibility: boolean
      filterReason: string | null
    }
  >()

  const attempts: RoutingAuditDetail['attempts'] = []
  let success = false

  for (const row of parsed) {
    const { log, meta, event } = row
    if (typeof meta.routingStrategy === 'string') routingStrategy = meta.routingStrategy
    if (meta.routingRuleMatched === 'Yes') routingRuleMatched = true
    if (typeof meta.routingRuleProvider === 'string' && meta.routingRuleProvider) {
      routingRuleProvider = meta.routingRuleProvider
    }
    if (typeof meta.verificationMappingCount === 'number') {
      mappingCount = Math.max(mappingCount, meta.verificationMappingCount)
    }

    if (event === 'LCR_PROVIDER_DISCOVERED' || event === 'LCR_PROVIDER_FILTERED') {
      if (!log.providerId) continue
      evaluatedMap.set(log.providerId, {
        providerId: log.providerId,
        providerName: log.providerName || log.providerCode || log.providerId,
        costPrice: log.providerCost,
        margin: null,
        priority: typeof meta.providerPriority === 'number' ? meta.providerPriority : null,
        eligibility: event === 'LCR_PROVIDER_DISCOVERED',
        filterReason:
          typeof meta.failureReason === 'string'
            ? meta.failureReason
            : event === 'LCR_PROVIDER_FILTERED'
              ? 'FILTERED'
              : null,
      })
    }

    if (
      event === 'HIGHEST_MARGIN_SELECTED' ||
      event === 'LEAST_COST_SELECTED' ||
      event === 'PRIORITY_SELECTED' ||
      event === 'RULE_MATCHED'
    ) {
      routingDecisionReason = event
      selectedProvider = log.providerName || log.providerCode || log.providerId || selectedProvider
    }

    if (
      event === 'NO_ELIGIBLE_PROVIDER' ||
      event === 'NO_PROVIDER_MAPPING' ||
      event === 'INTERNAL_PLAN_NOT_FOUND' ||
      event === 'RECHARGE_FAILED' ||
      event === 'MAX_RETRY_EXCEEDED'
    ) {
      routingDecisionReason = routingDecisionReason ?? event
    }

    if (event === 'RECHARGE_SUCCESS') {
      success = true
      routingDecisionReason = 'RECHARGE_SUCCESS'
      selectedProvider = log.providerName || log.providerCode || log.providerId || selectedProvider
      attempts.push({
        providerName: log.providerName || log.providerCode || '—',
        cost: log.providerCost,
        source: meta.routingRuleMatched === 'Yes' ? 'RULE' : 'LCR',
        ok: true,
      })
    }

    if (event === 'RETRY_FAILOVER' || event === 'RULE_PROVIDER_FAILED') {
      attempts.push({
        providerName: log.providerName || log.providerCode || '—',
        cost: log.providerCost,
        source: event === 'RULE_PROVIDER_FAILED' || meta.routingRuleMatched === 'Yes' ? 'RULE' : 'LCR',
        ok: false,
        error: typeof meta.failureReason === 'string' ? meta.failureReason : event,
        errorCode: typeof meta.responseCode === 'string' ? meta.responseCode : undefined,
        errorMessage: typeof meta.responseMessage === 'string' ? meta.responseMessage : undefined,
      })
    }
  }

  const evaluatedProviders = Array.from(evaluatedMap.values())
  const candidateProviderCount = evaluatedProviders.length
  const eligibleProviderCount = evaluatedProviders.filter((p) => p.eligibility).length

  if (!selectedProvider) {
    const priced = evaluatedProviders
      .filter((p) => p.costPrice != null)
      .sort((a, b) => (b.costPrice ?? 0) - (a.costPrice ?? 0))
    selectedProvider = priced[0]?.providerName ?? null
  }

  if (!mappingCount && candidateProviderCount > 0) {
    mappingCount = candidateProviderCount
  }

  return {
    id: first.id,
    distributor_ref: transactionId,
    internal_plan_id: first.productId,
    status: success ? 'success' : 'failed',
    routing_decision: {
      routing_strategy: routingStrategy,
      routing_rule_matched: routingRuleMatched,
      routing_rule_provider: routingRuleProvider,
      mapping_count: mappingCount,
      candidate_provider_count: candidateProviderCount,
      eligible_provider_count: eligibleProviderCount,
      selected_provider: selectedProvider,
      routing_decision_reason: routingDecisionReason,
      evaluated_providers: evaluatedProviders,
    },
    attempts,
  }
}
