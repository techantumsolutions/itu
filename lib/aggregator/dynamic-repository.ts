import { supabaseRest } from '@/lib/db/supabase-rest'
import { sha256 } from '@/lib/aggregator/signature'

function enc(v: string): string {
  return encodeURIComponent(v)
}

async function jsonRows<T = any>(res: Response): Promise<T[]> {
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as T[]
}

export type TelecomKeywordRuleRow = {
  id: string
  rule_type: string
  category: string
  keyword: string
  target_field: string
  weight: number
  is_regex: boolean
  is_active: boolean
}

export type TelecomNormalizationTokenRow = {
  id: string
  token: string
  token_type: string
  scope: string
  is_active: boolean
}

export async function isDynamicCatalogSchemaReady(): Promise<boolean> {
  try {
    const res = await supabaseRest('telecom_keyword_rules?select=id&limit=1', { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

export async function loadTelecomKeywordRules(): Promise<TelecomKeywordRuleRow[]> {
  const res = await supabaseRest(
    'telecom_keyword_rules?is_active=eq.true&select=id,rule_type,category,keyword,target_field,weight,is_regex,is_active&limit=5000',
    { cache: 'no-store' },
  )
  return jsonRows<TelecomKeywordRuleRow>(res)
}

export async function loadTelecomNormalizationTokens(scope?: string): Promise<TelecomNormalizationTokenRow[]> {
  const filters = [
    'is_active=eq.true',
    'select=id,token,token_type,scope,is_active',
    'limit=5000',
  ]
  if (scope) {
    filters.push(`or=(scope.eq.GLOBAL,scope.eq.${enc(scope)})`)
  }
  const res = await supabaseRest(`telecom_normalization_tokens?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRows<TelecomNormalizationTokenRow>(res)
}

export async function aggUpsertAggregateOperator(input: {
  normalizedName: string
  displayName: string
  countryId: string
  operatorClass: string
  confidenceScore: number
  duplicateConfidence: 'exact' | 'high' | 'medium' | 'low'
  metadata?: unknown
}) {
  const res = await supabaseRest('aggregate_operators?on_conflict=normalized_name,country_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      normalized_name: input.normalizedName,
      display_name: input.displayName,
      country_id: input.countryId,
      operator_class: input.operatorClass,
      confidence_score: input.confidenceScore,
      duplicate_confidence: input.duplicateConfidence,
      status: 'ACTIVE',
      metadata: input.metadata ?? {},
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertAggregateOperatorMapping(input: {
  providerId: string
  providerOperatorRawId: string
  aggregateOperatorId: string
  matchScore: number
  matchConfidence: 'exact' | 'high' | 'medium' | 'low'
  matchReason: string
}) {
  const res = await supabaseRest(
    'aggregate_operator_mappings?on_conflict=provider_id,provider_operator_raw_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        provider_id: input.providerId,
        provider_operator_raw_id: input.providerOperatorRawId,
        aggregate_operator_id: input.aggregateOperatorId,
        match_score: input.matchScore,
        match_confidence: input.matchConfidence,
        match_reason: input.matchReason,
      }),
    },
  )
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertOperatorAlias(input: {
  aggregateOperatorId: string
  aliasName: string
  providerId?: string | null
  providerOperatorRawId?: string | null
  confidenceScore?: number
}) {
  const res = await supabaseRest('aggregate_operator_aliases?on_conflict=aggregate_operator_id,alias_name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      aggregate_operator_id: input.aggregateOperatorId,
      alias_name: input.aliasName,
      provider_id: input.providerId ?? null,
      provider_operator_raw_id: input.providerOperatorRawId ?? null,
      confidence_score: input.confidenceScore ?? 0,
      source: 'AUTO',
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertSystemOperatorLineage(input: {
  aggregateOperatorId: string
  systemOperatorId: string
  confidenceScore: number
  reason: string
}) {
  const res = await supabaseRest('system_operator_lineage?on_conflict=aggregate_operator_id,system_operator_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      aggregate_operator_id: input.aggregateOperatorId,
      system_operator_id: input.systemOperatorId,
      confidence_score: input.confidenceScore,
      reason: input.reason,
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggInsertTransformAudit(input: {
  providerId?: string | null
  stage: string
  sourceTable?: string | null
  sourceId?: string | null
  targetTable?: string | null
  targetId?: string | null
  action: string
  reason?: string | null
  confidenceScore?: number | null
  details?: unknown
}) {
  const details = input.details ?? {}
  const detailsHash = sha256(JSON.stringify(details))
  await supabaseRest('transform_audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      provider_id: input.providerId ?? null,
      stage: input.stage,
      source_table: input.sourceTable ?? null,
      source_id: input.sourceId ?? null,
      target_table: input.targetTable ?? null,
      target_id: input.targetId ?? null,
      action: input.action,
      reason: input.reason ?? null,
      confidence_score: input.confidenceScore ?? null,
      details: { ...((details as Record<string, unknown>) ?? {}), details_hash: detailsHash },
    }),
  }).catch(() => {})
}
