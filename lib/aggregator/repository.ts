import { supabaseRest } from '@/lib/db/supabase-rest'
import type {
  AggregatorProviderRow,
  RawOperatorInput,
  RawPlanInput,
  SystemOperatorInput,
  SystemPlanInput,
} from '@/lib/aggregator/types'

function enc(v: string): string {
  return encodeURIComponent(v)
}

/** Columns guaranteed by supabase/uti_lcr_schema.sql */
const LCR_PROVIDER_BASE_SELECT =
  'id,code,name,adapter_key,is_active,priority,base_url,refresh_interval_minutes,supported_countries,credentials_encrypted,status'

async function jsonRows<T = any>(res: Response): Promise<T[]> {
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as T[]
}

export function isMissingAggregatorSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    message.includes('PGRST205') ||
    message.includes('schema cache') ||
    message.includes('Could not find the table') ||
    message.includes('provider_operator_raw') ||
    message.includes('system_operators') ||
    message.includes('system_plans') ||
    message.includes('plan_mappings') ||
    message.includes('sync_logs')
  )
}

let aggregatorSchemaReady: boolean | null = null

/** True when multi_provider_aggregator_schema tables exist (cached for process lifetime). */
export async function isAggregatorSchemaReady(): Promise<boolean> {
  if (aggregatorSchemaReady != null) return aggregatorSchemaReady
  try {
    const res = await supabaseRest('provider_operator_raw?select=id&limit=1', { cache: 'no-store' })
    aggregatorSchemaReady = res.ok
    return aggregatorSchemaReady
  } catch {
    aggregatorSchemaReady = false
    return false
  }
}

async function jsonRowsOrEmpty<T = any>(res: Response): Promise<T[]> {
  try {
    return await jsonRows<T>(res)
  } catch (error) {
    if (isMissingAggregatorSchemaError(error)) return []
    throw error
  }
}

export async function aggListProviders(): Promise<AggregatorProviderRow[]> {
  const res = await supabaseRest(`lcr_providers?select=${LCR_PROVIDER_BASE_SELECT}&order=priority.asc`, {
    cache: 'no-store',
  })
  return jsonRows<AggregatorProviderRow>(res)
}

export async function aggGetProvider(providerId: string): Promise<AggregatorProviderRow | null> {
  const res = await supabaseRest(
    `lcr_providers?id=eq.${enc(providerId)}&select=${LCR_PROVIDER_BASE_SELECT}&limit=1`,
    { cache: 'no-store' },
  )
  const rows = await jsonRows<AggregatorProviderRow>(res)
  return rows[0] ?? null
}

export async function aggPatchProvider(providerId: string, patch: Record<string, unknown>) {
  const res = await supabaseRest(`lcr_providers?id=eq.${enc(providerId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertRawOperator(input: RawOperatorInput) {
  const res = await supabaseRest('provider_operator_raw?on_conflict=service_provider_id,provider_operator_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      service_provider_id: input.serviceProviderId,
      provider_operator_id: input.providerOperatorId,
      provider_operator_name: input.providerOperatorName,
      country_code: input.countryCode ?? null,
      iso_code: input.isoCode ?? null,
      mobile_country_code: input.mobileCountryCode ?? null,
      logo: input.logo ?? null,
      operator_type: input.operatorType ?? null,
      currency: input.currency ?? null,
      status: input.status ?? 'active',
      raw_response_json: input.rawResponseJson,
      checksum_hash: input.checksumHash,
      fetched_at: new Date().toISOString(),
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertRawPlan(input: RawPlanInput) {
  const res = await supabaseRest('provider_plans_raw?on_conflict=provider_id,provider_plan_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      provider_id: input.providerId,
      provider_plan_id: input.providerPlanId,
      provider_operator_raw_id: input.providerOperatorRawId ?? null,
      provider_plan_name: input.providerPlanName ?? null,
      provider_plan_code: input.providerPlanCode ?? input.providerPlanId,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      validity: input.validity ?? null,
      talktime: input.talktime ?? null,
      data_volume: input.dataVolume ?? null,
      sms: input.sms ?? null,
      description: input.description ?? null,
      plan_type: input.planType ?? null,
      benefits_json: input.benefitsJson ?? {},
      raw_json: input.rawJson,
      checksum_hash: input.checksumHash,
      status: input.status ?? 'ACTIVE',
      fetched_at: new Date().toISOString(),
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertSystemOperator(input: SystemOperatorInput) {
  const res = await supabaseRest('system_operators?on_conflict=slug,country_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      system_operator_name: input.systemOperatorName,
      slug: input.slug,
      country_id: input.countryId,
      logo: input.logo ?? null,
      operator_type: input.operatorType ?? null,
      status: input.status ?? 'ACTIVE',
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertOperatorMapping(input: {
  serviceProviderId: string
  providerOperatorRawId: string
  systemOperatorId: string
  mappingConfidence: number
  mappingType: string
  isVerified?: boolean
  verifiedBy?: string | null
}) {
  const res = await supabaseRest('operator_mappings?on_conflict=service_provider_id,provider_operator_raw_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      service_provider_id: input.serviceProviderId,
      provider_operator_raw_id: input.providerOperatorRawId,
      system_operator_id: input.systemOperatorId,
      mapping_confidence: input.mappingConfidence,
      mapping_type: input.mappingType,
      is_verified: input.isVerified ?? false,
      verified_by: input.verifiedBy ?? null,
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertSystemPlan(input: SystemPlanInput) {
  const res = await supabaseRest('system_plans?on_conflict=system_operator_id,normalized_signature', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      system_operator_id: input.systemOperatorId,
      internal_plan_id: input.internalPlanId ?? null,
      system_plan_name: input.systemPlanName,
      slug: input.slug,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      validity: input.validity ?? null,
      talktime: input.talktime ?? null,
      data_volume: input.dataVolume ?? null,
      sms: input.sms ?? null,
      plan_type: input.planType ?? null,
      description: input.description ?? null,
      normalized_signature: input.normalizedSignature,
      status: input.status ?? 'ACTIVE',
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggFindSystemPlanCandidates(input: {
  systemOperatorId: string
  amount?: number | null
  currency?: string | null
  limit?: number
}) {
  const filters = [
    `system_operator_id=eq.${enc(input.systemOperatorId)}`,
    'status=eq.ACTIVE',
    `limit=${input.limit ?? 10}`,
    'select=id,normalized_signature,amount,currency,validity,data_volume,sms,talktime,plan_type,system_plan_name',
  ]
  if (input.amount != null) filters.push(`amount=eq.${input.amount}`)
  if (input.currency) filters.push(`currency=eq.${enc(input.currency)}`)
  const res = await supabaseRest(`system_plans?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggUpsertPlanMapping(input: {
  serviceProviderId: string
  providerPlanRawId: string
  systemPlanId: string
  matchingScore: number
  matchingReason?: string | null
  isVerified?: boolean
  verifiedBy?: string | null
}) {
  const res = await supabaseRest('plan_mappings?on_conflict=service_provider_id,provider_plan_raw_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      service_provider_id: input.serviceProviderId,
      provider_plan_raw_id: input.providerPlanRawId,
      system_plan_id: input.systemPlanId,
      matching_score: input.matchingScore,
      matching_reason: input.matchingReason ?? null,
      is_verified: input.isVerified ?? false,
      verified_by: input.verifiedBy ?? null,
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertDuplicateSuggestion(input: {
  serviceProviderId: string
  providerPlanRawId: string
  suggestedSystemPlanId: string
  matchScore: number
  matchReason: string
  benefitsComparison: Record<string, unknown>
}) {
  const res = await supabaseRest(
    'duplicate_plan_suggestions?on_conflict=service_provider_id,provider_plan_raw_id,suggested_system_plan_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        service_provider_id: input.serviceProviderId,
        provider_plan_raw_id: input.providerPlanRawId,
        suggested_system_plan_id: input.suggestedSystemPlanId,
        match_score: input.matchScore,
        match_reason: input.matchReason,
        benefits_comparison: input.benefitsComparison,
        status: 'PENDING',
      }),
    },
  )
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggInsertSyncLog(input: {
  serviceProviderId?: string | null
  syncType: string
  stage: string
  status: string
  startedAt?: string
  finishedAt?: string | null
  durationMs?: number | null
  fetchedCount?: number
  normalizedCount?: number
  createdCount?: number
  mappedCount?: number
  duplicateCount?: number
  errorMessage?: string | null
  retryCount?: number
  metadata?: unknown
}) {
  const res = await supabaseRest('sync_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      service_provider_id: input.serviceProviderId ?? null,
      sync_type: input.syncType,
      stage: input.stage,
      status: input.status,
      started_at: input.startedAt ?? new Date().toISOString(),
      finished_at: input.finishedAt ?? null,
      duration_ms: input.durationMs ?? null,
      fetched_count: input.fetchedCount ?? 0,
      normalized_count: input.normalizedCount ?? 0,
      created_count: input.createdCount ?? 0,
      mapped_count: input.mappedCount ?? 0,
      duplicate_count: input.duplicateCount ?? 0,
      error_message: input.errorMessage ?? null,
      retry_count: input.retryCount ?? 0,
      metadata: input.metadata ?? {},
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggAudit(input: {
  actor?: string | null
  action: string
  entityType: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  details?: unknown
}) {
  await supabaseRest('mapping_audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      actor: input.actor ?? 'system',
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before_json: input.before ?? null,
      after_json: input.after ?? null,
      details: input.details ?? {},
    }),
  }).catch(() => {})
}

export async function aggListRawOperators(params: { limit?: number; offset?: number; country?: string; providerId?: string }) {
  const q = [
    'select=*',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=fetched_at.desc',
  ]
  if (params.country) q.push(`iso_code=eq.${enc(params.country)}`)
  if (params.providerId) q.push(`service_provider_id=eq.${enc(params.providerId)}`)
  const res = await supabaseRest(`provider_operator_raw?${q.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggListRawPlans(params: { limit?: number; offset?: number; providerId?: string; operatorRawId?: string }) {
  const q = [
    'select=*',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=fetched_at.desc',
  ]
  if (params.providerId) q.push(`provider_id=eq.${enc(params.providerId)}`)
  if (params.operatorRawId) q.push(`provider_operator_raw_id=eq.${enc(params.operatorRawId)}`)
  const res = await supabaseRest(`provider_plans_raw?${q.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggListSystemOperators(params: { country?: string; q?: string; limit?: number; offset?: number }) {
  const filters = [
    'select=*',
    'status=eq.ACTIVE',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=system_operator_name.asc',
  ]
  if (params.country) filters.push(`country_id=eq.${enc(params.country)}`)
  if (params.q) filters.push(`system_operator_name=ilike.*${enc(params.q)}*`)
  const res = await supabaseRest(`system_operators?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggListSystemPlans(params: { systemOperatorId?: string; q?: string; limit?: number; offset?: number }) {
  const filters = [
    'select=*',
    'status=eq.ACTIVE',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=amount.asc',
  ]
  if (params.systemOperatorId) filters.push(`system_operator_id=eq.${enc(params.systemOperatorId)}`)
  if (params.q) filters.push(`system_plan_name=ilike.*${enc(params.q)}*`)
  const res = await supabaseRest(`system_plans?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggListDuplicateSuggestions(params: { status?: string; limit?: number; offset?: number }) {
  const filters = [
    'select=*',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=match_score.desc',
  ]
  if (params.status) filters.push(`status=eq.${enc(params.status)}`)
  const res = await supabaseRest(`duplicate_plan_suggestions?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggListSyncLogs(params: { providerId?: string; limit?: number; offset?: number }) {
  const filters = [
    'select=*',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=created_at.desc',
  ]
  if (params.providerId) filters.push(`service_provider_id=eq.${enc(params.providerId)}`)
  const res = await supabaseRest(`sync_logs?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggResolveInternalPlanIdForSystemPlan(systemPlanId: string): Promise<string | null> {
  const res = await supabaseRest(`system_plans?id=eq.${enc(systemPlanId)}&select=internal_plan_id&limit=1`, { cache: 'no-store' })
  const rows = await jsonRowsOrEmpty<{ internal_plan_id: string | null }>(res)
  return rows[0]?.internal_plan_id ?? null
}
