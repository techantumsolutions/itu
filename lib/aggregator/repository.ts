import { supabaseRest } from '@/lib/db/supabase-rest'
import { isTelecomSystemPlan } from './telecom-validator'
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
  'id,code,name,adapter_key,is_active,priority,base_url,refresh_interval_minutes,supported_countries,credentials_encrypted,status,last_sync_at,last_success_sync_at'

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
  const targetLimit = params.limit ?? 50
  const startOffset = params.offset ?? 0

  let allRows: any[] = []
  let currentOffset = startOffset
  let remaining = targetLimit

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining, 1000)
    const q = [
      'select=*',
      `limit=${fetchLimit}`,
      `offset=${currentOffset}`,
      'order=fetched_at.desc',
    ]
    if (params.country) q.push(`iso_code=eq.${enc(params.country)}`)
    if (params.providerId) q.push(`service_provider_id=eq.${enc(params.providerId)}`)
    const res = await supabaseRest(`provider_operator_raw?${q.join('&')}`, { cache: 'no-store' })
    const rows = await jsonRowsOrEmpty(res)

    if (!rows.length) break
    allRows.push(...rows)
    if (rows.length < fetchLimit) break

    currentOffset += rows.length
    remaining -= rows.length
  }
  return allRows
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

export async function aggListSystemOperators(params: { country?: string; q?: string; limit?: number; offset?: number; status?: string; includeAllStatus?: boolean }) {
  const targetLimit = params.limit ?? 50
  const startOffset = params.offset ?? 0

  let allRows: any[] = []
  let currentOffset = startOffset
  let remaining = targetLimit

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining, 1000)
    const filters = [
      'select=*',
    ]
    if (params.includeAllStatus) {
      if (params.status) {
        filters.push(`status=eq.${enc(params.status)}`)
      }
    } else {
      filters.push(params.status ? `status=eq.${enc(params.status)}` : 'status=eq.ACTIVE')
    }

    filters.push(
      `limit=${fetchLimit}`,
      `offset=${currentOffset}`,
      'order=system_operator_name.asc',
    )
    if (params.country) filters.push(`country_id=eq.${enc(params.country)}`)
    if (params.q) filters.push(`system_operator_name=ilike.*${enc(params.q)}*`)
    const res = await supabaseRest(`system_operators?${filters.join('&')}`, { cache: 'no-store' })
    const rows = await jsonRowsOrEmpty(res)

    if (!rows.length) break
    allRows.push(...rows)
    if (rows.length < fetchLimit) break

    currentOffset += rows.length
    remaining -= rows.length
  }
  return allRows
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

export async function aggUpsertFilteredOperator(input: {
  providerId: string
  rawOperatorId: string
  rawOperatorName: string
  filterReason: string
  classificationScore: number
}) {
  const res = await supabaseRest('agg_filtered_operators?on_conflict=provider_id,raw_operator_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      provider_id: input.providerId,
      raw_operator_id: input.rawOperatorId,
      raw_operator_name: input.rawOperatorName,
      filter_reason: input.filterReason,
      classification_score: input.classificationScore,
      updated_at: new Date().toISOString(),
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggCleanupSystemOperatorsWithoutPlans(): Promise<number> {
  // 1. Fetch all active system plans and group by system_operator_id
  let offset = 0
  let hasMore = true
  const plansByOperatorId = new Map<string, any[]>()

  while (hasMore) {
    const res = await supabaseRest(
      `system_plans?status=eq.ACTIVE&select=system_operator_id,system_plan_name,description,plan_type,data_volume,sms,talktime&limit=1000&offset=${offset}`,
      { cache: 'no-store' }
    )
    if (!res.ok) {
      hasMore = false
      break
    }
    const rows = (await res.json()) as any[]
    if (!rows || !rows.length) {
      hasMore = false
      break
    }
    for (const row of rows) {
      if (row.system_operator_id) {
        if (!plansByOperatorId.has(row.system_operator_id)) {
          plansByOperatorId.set(row.system_operator_id, [])
        }
        plansByOperatorId.get(row.system_operator_id)!.push(row)
      }
    }
    if (rows.length < 1000) {
      hasMore = false
    } else {
      offset += 1000
    }
  }

  // 2. Fetch all system operators and check if they need deactivation
  offset = 0
  hasMore = true
  let deactivatedCount = 0

  while (hasMore) {
    const res = await supabaseRest(`system_operators?select=id,status,system_operator_name,country_id&limit=1000&offset=${offset}`, { cache: 'no-store' })
    if (!res.ok) {
      hasMore = false
      break
    }
    const rows = (await res.json()) as { id: string; status: string; system_operator_name: string; country_id: string }[]
    if (!rows || !rows.length) {
      hasMore = false
      break
    }
    const retentionDays = Number(process.env.OPERATOR_RETENTION_DAYS || '30')
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

    for (const row of rows) {
      const plans = plansByOperatorId.get(row.id) || []
      const totalPlanCount = plans.length
      
      let telecomPlanCount = 0
      for (const plan of plans) {
        if (isTelecomSystemPlan(plan)) {
          telecomPlanCount++
        }
      }
      
      const telecomRatio = totalPlanCount > 0 ? telecomPlanCount / totalPlanCount : 0
      
      let validationPassed = true
      let filterReason = ''
      
      if (totalPlanCount === 0) {
        validationPassed = false
        filterReason = 'NO_VALID_PLANS'
      } else if (telecomPlanCount === 0) {
        validationPassed = false
        filterReason = 'NO_TELECOM_PLANS'
      } else if (telecomRatio < 0.1) {
        validationPassed = false
        filterReason = 'LOW_TELECOM_RATIO'
      }

      if (validationPassed) {
        if (row.status !== 'ACTIVE') {
          await supabaseRest(`system_operators?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'ACTIVE' }),
          }).catch(() => {})
        }
      } else {
        if (row.status === 'ACTIVE') {
          console.log(`[Cleanup] Deactivating system operator '${row.system_operator_name}' (${row.id}) in ${row.country_id}. Reason: ${filterReason}. Total plans: ${totalPlanCount}, Telecom plans: ${telecomPlanCount}, Ratio: ${telecomRatio}`)
          await supabaseRest(`system_operators?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'INACTIVE' }),
          }).catch(() => {})
          deactivatedCount++

          // Audit log for deactivation
          await aggInsertClassificationAudit({
            providerCode: 'SYSTEM_CLEANUP',
            providerOperatorId: row.id,
            entityType: 'operator',
            entityName: row.system_operator_name,
            decision: 'REJECTED',
            classification: 'UNKNOWN',
            confidence: telecomRatio,
            reason_code: filterReason,
            details: {
              country: row.country_id,
              telecomPlanCount,
              totalPlanCount,
              telecomRatio,
              action: 'DEACTIVATE_CLEANUP'
            }
          }).catch(() => {})
        } else if (row.status === 'INACTIVE') {
          const updatedAt = new Date((row as any).updated_at || Date.now())
          if (updatedAt < cutoffDate) {
            await supabaseRest(`system_operators?id=eq.${encodeURIComponent(row.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'DEPRECATED' }),
            }).catch(() => {})
          }
        }
      }
    }
    if (rows.length < 1000) {
      hasMore = false
    } else {
      offset += 1000
    }
  }

  return deactivatedCount
}

export async function aggStartSyncRun(providerCode: string): Promise<string> {
  const res = await supabaseRest('sync_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      provider_code: providerCode,
      status: 'running',
      started_at: new Date().toISOString(),
    }),
  })
  const rows = await jsonRows(res)
  return rows[0]?.id
}

export async function aggUpdateSyncRun(runId: string, updates: Record<string, any>) {
  await supabaseRest(`sync_runs?id=eq.${enc(runId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }).catch(() => {})
}

export async function aggInsertClassificationAudit(input: {
  providerCode: string
  providerOperatorId?: string | null
  providerPlanId?: string | null
  entityType: 'operator' | 'plan'
  entityName: string
  decision: string
  classification: string
  confidence: number
  reasonCode: string
  details?: any
}) {
  await supabaseRest('classification_audit', {
    method: 'POST',
    body: JSON.stringify({
      provider_code: input.providerCode,
      provider_operator_id: input.providerOperatorId ?? null,
      provider_plan_id: input.providerPlanId ?? null,
      entity_type: input.entityType,
      entity_name: input.entityName,
      decision: input.decision,
      classification: input.classification,
      confidence: input.confidence,
      reason_code: input.reasonCode,
      details: input.details ?? {},
    }),
  }).catch(() => {})
}

export async function aggInsertClassificationReviewQueue(input: {
  providerCode: string
  providerOperatorId?: string | null
  providerPlanId?: string | null
  entityType: 'operator' | 'plan'
  entityName: string
  category?: string | null
  subCategory?: string | null
  benefits?: any
  rawPayload?: any
  confidence: number
}) {
  await supabaseRest('classification_review_queue?on_conflict=provider_code,entity_type,entity_name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      provider_code: input.providerCode,
      provider_operator_id: input.providerOperatorId ?? null,
      provider_plan_id: input.providerPlanId ?? null,
      entity_type: input.entityType,
      entity_name: input.entityName,
      category: input.category ?? null,
      sub_category: input.subCategory ?? null,
      benefits: input.benefits ?? {},
      raw_payload: input.rawPayload ?? {},
      confidence: input.confidence,
      status: 'PENDING',
    }),
  }).catch(() => {})
}

export async function aggMergeSystemOperators(targetOperatorId: string, sourceOperatorIds: string[], actorEmail: string = 'system') {
  // 1. Verify target operator exists
  const targetRes = await supabaseRest(
    `system_operators?id=eq.${encodeURIComponent(targetOperatorId)}&select=*&limit=1`,
    { cache: 'no-store' }
  )
  if (!targetRes.ok) throw new Error(`Failed to check target operator: ${await targetRes.text()}`)
  const targetRows = await targetRes.json() as any[]
  if (targetRows.length === 0) {
    throw new Error('Target operator not found')
  }
  const targetOperator = targetRows[0]

  const logs: string[] = []

  // 2. Process each source operator
  for (const sourceId of sourceOperatorIds) {
    if (sourceId === targetOperatorId) continue

    // Get source operator info for logging/audit
    const sourceRes = await supabaseRest(
      `system_operators?id=eq.${encodeURIComponent(sourceId)}&select=*&limit=1`,
      { cache: 'no-store' }
    )
    if (!sourceRes.ok) continue
    const sourceRows = await sourceRes.json() as any[]
    if (sourceRows.length === 0) continue
    const sourceOperator = sourceRows[0]

    // Fetch all system plans for the source operator
    const plansRes = await supabaseRest(
      `system_plans?system_operator_id=eq.${encodeURIComponent(sourceId)}&select=*`,
      { cache: 'no-store' }
    )
    if (plansRes.ok) {
      const plans = await plansRes.json() as any[]
      for (const sp of plans) {
        // Check if target operator already has a plan with the same signature
        const existingPlanRes = await supabaseRest(
          `system_plans?system_operator_id=eq.${encodeURIComponent(
            targetOperatorId
          )}&normalized_signature=eq.${encodeURIComponent(sp.normalized_signature)}&select=*&limit=1`,
          { cache: 'no-store' }
        )
        if (existingPlanRes.ok) {
          const existingPlanRows = await existingPlanRes.json() as any[]
          if (existingPlanRows.length > 0) {
            const targetSp = existingPlanRows[0]
            // Update plan mappings
            await supabaseRest(
              `plan_mappings?system_plan_id=eq.${encodeURIComponent(sp.id)}`,
              {
                method: 'PATCH',
                body: JSON.stringify({ system_plan_id: targetSp.id }),
              }
            )
            // Update duplicate plan suggestions
            await supabaseRest(
              `duplicate_plan_suggestions?suggested_system_plan_id=eq.${encodeURIComponent(sp.id)}`,
              {
                method: 'PATCH',
                body: JSON.stringify({ suggested_system_plan_id: targetSp.id }),
              }
            )
            // Delete duplicate source plan
            await supabaseRest(`system_plans?id=eq.${encodeURIComponent(sp.id)}`, {
              method: 'DELETE',
            })
            continue
          }
        }

        // If no signature conflict, update the system operator ID of the plan
        await supabaseRest(`system_plans?id=eq.${encodeURIComponent(sp.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ system_operator_id: targetOperatorId }),
        })
      }
    }

    // Remap raw operators mappings
    await supabaseRest(`operator_mappings?system_operator_id=eq.${encodeURIComponent(sourceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ system_operator_id: targetOperatorId }),
    })

    // Remap system operator lineage safely
    const lineageRes = await supabaseRest(
      `system_operator_lineage?system_operator_id=eq.${encodeURIComponent(sourceId)}&select=*`,
      { cache: 'no-store' }
    )
    if (lineageRes.ok) {
      const lineages = await lineageRes.json() as any[]
      for (const lin of lineages) {
        // Check if target operator already has this lineage
        const targetLinRes = await supabaseRest(
          `system_operator_lineage?system_operator_id=eq.${encodeURIComponent(
            targetOperatorId
          )}&aggregate_operator_id=eq.${encodeURIComponent(lin.aggregate_operator_id)}&select=id&limit=1`,
          { cache: 'no-store' }
        )
        if (targetLinRes.ok) {
          const targetLinRows = await targetLinRes.json() as any[]
          if (targetLinRows.length > 0) {
            // Delete source lineage as it is a duplicate
            await supabaseRest(`system_operator_lineage?id=eq.${encodeURIComponent(lin.id)}`, {
              method: 'DELETE',
            })
            continue
          }
        }
        // Update lineage to point to target operator
        await supabaseRest(`system_operator_lineage?id=eq.${encodeURIComponent(lin.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ system_operator_id: targetOperatorId }),
        })
      }
    }

    // Remap operator_ref in internal_plans
    try {
      await supabaseRest(
        `internal_plans?operator_ref=eq.system:${encodeURIComponent(sourceId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            operator_ref: `system:${targetOperatorId}`,
          }),
        }
      )
    } catch (err) {
      console.warn(`Failed to update internal plans for source operator ${sourceId}:`, err)
    }

    // Delete the source operator
    await supabaseRest(`system_operators?id=eq.${encodeURIComponent(sourceId)}`, {
      method: 'DELETE',
    })

    logs.push(`Merged system operator '${sourceOperator.system_operator_name}' (${sourceId}) into '${targetOperator.system_operator_name}' (${targetOperatorId})`)
  }

  // Audit Log
  await aggAudit({
    actor: actorEmail,
    action: 'operators.merge',
    entityType: 'system_operator',
    entityId: targetOperatorId,
    after: targetOperator,
    details: {
      targetOperatorId,
      sourceOperatorIds,
      logs,
    },
  }).catch(() => {})

  return { success: true, logs }
}
