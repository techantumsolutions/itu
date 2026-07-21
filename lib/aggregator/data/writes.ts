/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { isTelecomSystemPlan } from '../telecom-validator'
import { CatalogIntelligenceEngine } from '../catalog-intelligence'
import { isMobileTelecomDomain } from '../catalog-intelligence/domain-registries'
import { matchTrustedOperator } from '../catalog-intelligence/trust-registry'
import type {
  AggregatorProviderRow,
  RawOperatorInput,
  RawPlanInput,
  SystemOperatorInput,
  SystemPlanInput,
} from '@/lib/aggregator/types'
import type { OperatorDomain } from '@/lib/aggregator/catalog-intelligence/types'
import {
  logStep7Promotion,
  validateSystemOperatorPromotionInput,
} from '@/lib/aggregator/pipeline/step7-promotion-log'
import { aggLoadCatalogIntelligenceRegistries } from './queries'
import { enc, jsonRows } from './shared'

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
      raw_quality_score: input.rawQualityScore ?? null,
      has_description: input.hasDescription ?? null,
      has_benefits: input.hasBenefits ?? null,
      has_category: input.hasCategory ?? null,
      has_amount: input.hasAmount ?? null,
      has_validity: input.hasValidity ?? null,
      has_currency: input.hasCurrency ?? null,
      raw_completeness_percent: input.rawCompletenessPercent ?? null,
      catalog_status: input.catalogStatus ?? null,
      confidence_level: input.confidenceLevel ?? null,
      confidence_score: input.confidenceScore ?? null,
      service_domain: input.serviceDomain ?? null,
      service_domain_confidence: input.serviceDomainConfidence ?? null,
      service_domain_source: input.serviceDomainSource ?? null,
      country_code: input.countryCode ?? 'UNK',
      destination_amount: input.destinationAmount ?? null,
      destination_currency: input.destinationCurrency ?? null,
      fetched_at: new Date().toISOString(),
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertSystemOperator(input: SystemOperatorInput) {
  const validated = validateSystemOperatorPromotionInput(input)
  if (!validated.ok) {
    logStep7Promotion({
      entity: 'operator',
      operation: 'SKIP',
      systemOperatorName: input.systemOperatorName,
      countryCode: input.countryId,
      reason: validated.reason,
    })
    return null
  }

  const { name: systemOperatorName, slug, countryId } = validated

  const existingRes = await supabaseRest(
    `system_operators?slug=eq.${enc(slug)}&country_id=eq.${enc(countryId)}&select=id,name_manually_edited,system_operator_name&limit=1`,
    { cache: 'no-store' },
  ).catch(() => null)

  let existingId: string | null = null
  let preserveName = false
  if (existingRes?.ok) {
    const rows = (await existingRes.json().catch(() => [])) as Array<{
      id?: string
      name_manually_edited?: boolean | null
      system_operator_name?: string | null
    }>
    if (rows[0]?.id) {
      existingId = String(rows[0].id)
      preserveName = rows[0].name_manually_edited === true
    }
  }

  const sharedFields: Record<string, unknown> = {
    logo: input.logo ?? null,
    operator_type: input.operatorType ?? null,
    status: input.status ?? 'ACTIVE',
    operator_domain: input.operatorDomain ?? null,
    operator_domain_confidence: input.operatorDomainConfidence ?? null,
    domain_classification_source: input.domainClassificationSource ?? null,
    service_domain: input.serviceDomain ?? input.operatorDomain ?? null,
    service_domain_confidence: input.serviceDomainConfidence ?? input.operatorDomainConfidence ?? null,
    service_domain_source: input.serviceDomainSource ?? input.domainClassificationSource ?? null,
  }

  if (existingId) {
    const patchBody: Record<string, unknown> = { ...sharedFields }
    if (!preserveName) {
      patchBody.system_operator_name = systemOperatorName
    }

    const patchRes = await supabaseRest(`system_operators?id=eq.${enc(existingId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patchBody),
    })

    if (!patchRes.ok) {
      const detail = await patchRes.text().catch(() => '')
      logStep7Promotion({
        entity: 'operator',
        operation: 'SKIP',
        systemOperatorId: existingId,
        systemOperatorName,
        countryCode: countryId,
        reason: 'operator_patch_failed',
        error: detail,
      })
      throw new Error(detail || 'Failed to update system operator')
    }

    const rows = await jsonRows(patchRes)
    logStep7Promotion({
      entity: 'operator',
      operation: preserveName ? 'SKIP' : 'UPDATE',
      systemOperatorId: existingId,
      systemOperatorName: preserveName ? rows[0]?.system_operator_name : systemOperatorName,
      countryCode: countryId,
      reason: preserveName ? 'name_manually_edited_preserved' : 'operator_updated',
    })
    return rows[0] ?? { id: existingId, system_operator_name: systemOperatorName }
  }

  const insertBody: Record<string, unknown> = {
    ...sharedFields,
    slug,
    country_id: countryId,
    system_operator_name: systemOperatorName,
  }

  const insertRes = await supabaseRest('system_operators', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(insertBody),
  })

  if (!insertRes.ok) {
    const detail = await insertRes.text().catch(() => '')
    if (detail.includes('23505') || detail.toLowerCase().includes('duplicate')) {
      const retryRes = await supabaseRest(
        `system_operators?slug=eq.${enc(slug)}&country_id=eq.${enc(countryId)}&select=id,name_manually_edited&limit=1`,
        { cache: 'no-store' },
      ).catch(() => null)
      if (retryRes?.ok) {
        const retryRows = (await retryRes.json().catch(() => [])) as Array<{
          id?: string
          name_manually_edited?: boolean | null
        }>
        if (retryRows[0]?.id) {
          const racePreserveName = retryRows[0].name_manually_edited === true
          const racePatch: Record<string, unknown> = { ...sharedFields }
          if (!racePreserveName) racePatch.system_operator_name = systemOperatorName
          const racePatchRes = await supabaseRest(`system_operators?id=eq.${enc(String(retryRows[0].id))}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(racePatch),
          })
          if (racePatchRes.ok) {
            const raceRows = await jsonRows(racePatchRes)
            return raceRows[0] ?? { id: retryRows[0].id }
          }
        }
      }
    }
    logStep7Promotion({
      entity: 'operator',
      operation: 'SKIP',
      systemOperatorName,
      countryCode: countryId,
      reason: 'operator_insert_failed',
      error: detail,
    })
    throw new Error(detail || 'Failed to insert system operator')
  }

  const rows = await jsonRows(insertRes)
  logStep7Promotion({
    entity: 'operator',
    operation: 'INSERT',
    systemOperatorId: rows[0]?.id ? String(rows[0].id) : null,
    systemOperatorName,
    countryCode: countryId,
    reason: 'operator_created',
  })
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
      catalog_status: input.catalogStatus ?? null,
      confidence_level: input.confidenceLevel ?? null,
      confidence_score: input.confidenceScore ?? null,
      service_domain: input.serviceDomain ?? null,
      service_domain_confidence: input.serviceDomainConfidence ?? null,
      service_domain_source: input.serviceDomainSource ?? null,
      country_code: input.countryCode ?? 'UNK',
    }),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}

export async function aggUpsertPlanMapping(input: {
  serviceProviderId: string
  providerPlanRawId: string
  systemPlanId: string
  providerPlanId?: string | null
  matchingScore: number
  matchingReason?: string | null
  isVerified?: boolean
  verifiedBy?: string | null
  countryCode?: string | null
}) {
  const res = await supabaseRest(
    'plan_mappings?on_conflict=service_provider_id,provider_plan_raw_id,system_plan_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        service_provider_id: input.serviceProviderId,
        provider_plan_raw_id: input.providerPlanRawId,
        provider_plan_id: input.providerPlanId ?? null,
        system_plan_id: input.systemPlanId,
        matching_score: input.matchingScore,
        matching_reason: input.matchingReason ?? null,
        is_verified: input.isVerified ?? false,
        verified_by: input.verifiedBy ?? null,
        country_code: input.countryCode ?? 'UNK',
        updated_at: new Date().toISOString(),
      }),
    },
  )
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

export async function aggPatchSyncLog(
  logId: string,
  input: {
    status?: string
    finishedAt?: string
    durationMs?: number
    fetchedCount?: number
    normalizedCount?: number
    createdCount?: number
    mappedCount?: number
    duplicateCount?: number
    errorMessage?: string | null
    metadata?: unknown
  },
) {
  const body: Record<string, unknown> = {}
  if (input.status != null) body.status = input.status
  if (input.finishedAt != null) body.finished_at = input.finishedAt
  if (input.durationMs != null) body.duration_ms = input.durationMs
  if (input.fetchedCount != null) body.fetched_count = input.fetchedCount
  if (input.normalizedCount != null) body.normalized_count = input.normalizedCount
  if (input.createdCount != null) body.created_count = input.createdCount
  if (input.mappedCount != null) body.mapped_count = input.mappedCount
  if (input.duplicateCount != null) body.duplicate_count = input.duplicateCount
  if (input.errorMessage !== undefined) body.error_message = input.errorMessage
  if (input.metadata !== undefined) body.metadata = input.metadata

  await supabaseRest(`sync_logs?id=eq.${enc(logId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }).catch(() => {})
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
  const { trustedOperators, domainRegistry, nonTelecomRegistry } = await aggLoadCatalogIntelligenceRegistries().catch((): Awaited<ReturnType<typeof aggLoadCatalogIntelligenceRegistries>> => ({
      trustedOperators: [],
      domainRegistry: [],
      nonTelecomRegistry: [],
    }))
  const engine = new CatalogIntelligenceEngine(trustedOperators, domainRegistry, nonTelecomRegistry)

  // 1. Fetch all active system plans and group by system_operator_id
  let offset = 0
  let hasMore = true
  const plansByOperatorId = new Map<string, any[]>()

  while (hasMore) {
    const res = await supabaseRest(
      `system_plans?status=eq.ACTIVE&select=system_operator_id,system_plan_name,description,plan_type,data_volume,sms,talktime,catalog_status,confidence_level&limit=1000&offset=${offset}`,
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

  // 2. Soft cleanup: only deactivate after repeated failures + strong non-telecom signal
  offset = 0
  hasMore = true
  let deactivatedCount = 0

  while (hasMore) {
    const res = await supabaseRest(
      `system_operators?select=id,status,system_operator_name,country_id,failed_sync_count,last_valid_sync_at,is_trusted_telecom,updated_at,service_domain,operator_domain&limit=1000&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      hasMore = false
      break
    }
    const rows = (await res.json()) as {
      id: string
      status: string
      system_operator_name: string
      country_id: string
      failed_sync_count?: number
      last_valid_sync_at?: string | null
      is_trusted_telecom?: boolean
      updated_at?: string
      service_domain?: string | null
      operator_domain?: string | null
    }[]
    if (!rows || !rows.length) {
      hasMore = false
      break
    }
    const retentionDays = Number(process.env.OPERATOR_RETENTION_DAYS || '30')
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

    for (const row of rows) {
      const plans = plansByOperatorId.get(row.id) || []
      const totalPlanCount = plans.length
      const trusted =
        row.is_trusted_telecom ||
        Boolean(matchTrustedOperator(row.system_operator_name, row.country_id, trustedOperators)?.isVerifiedTelecom)

      let telecomPlanCount = 0
      for (const plan of plans) {
        if (isTelecomSystemPlan(plan) || plan.catalog_status === 'ACTIVE' || plan.catalog_status === 'REVIEW') {
          telecomPlanCount++
        }
      }

      const promotionEval = engine.evaluateOperatorPromotion({
        operatorName: row.system_operator_name,
        countryCode: row.country_id,
        rawPlans: plans.map((plan) => ({
          product_name: plan.system_plan_name,
          description: plan.description,
          type: plan.plan_type,
          benefits: [],
        })),
        failedSyncCount: row.failed_sync_count ?? 0,
        hasTelecomHistory: Boolean(row.last_valid_sync_at),
      })
      const domainEval = promotionEval.domainEvaluation ?? engine.evaluateOperatorDomain({
        operatorName: row.system_operator_name,
        countryCode: row.country_id,
        rawPlans: plans.map((plan) => ({
          product_name: plan.system_plan_name,
          description: plan.description,
          type: plan.plan_type,
          benefits: [],
        })),
      })

      await aggPatchSystemOperatorDomain(row.id, {
        operatorDomain: domainEval.domain,
        operatorDomainConfidence: domainEval.confidence,
        domainClassificationSource: domainEval.classificationSource,
        serviceDomain: domainEval.domain,
        serviceDomainConfidence: domainEval.confidence,
        serviceDomainSource: domainEval.classificationSource,
      })

      const isMobileCatalogOperator =
        isMobileTelecomDomain(domainEval.domain) && !domainEval.isBlockedFromTelecom

      if (!isMobileCatalogOperator) {
        if (row.status === 'ACTIVE') {
          console.log(
            `[Cleanup] Removing non-mobile operator '${row.system_operator_name}' (${row.id}) from catalog. Domain: ${domainEval.domain}`,
          )
          await supabaseRest(`system_operators?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'INACTIVE',
              confidence_level: promotionEval.confidenceLevel,
            }),
          }).catch(() => {})
          deactivatedCount++
        }
        continue
      }

      const shouldKeepActive =
        (trusted || promotionEval.shouldPromote || telecomPlanCount >= 1) &&
        isMobileTelecomDomain(promotionEval.operatorDomain)
      const shouldDeactivate = !shouldKeepActive && promotionEval.shouldDeactivate

      if (shouldKeepActive) {
        if (row.status !== 'ACTIVE') {
          await supabaseRest(`system_operators?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'ACTIVE',
              is_trusted_telecom: trusted || row.is_trusted_telecom || false,
              confidence_level: promotionEval.confidenceLevel,
            }),
          }).catch(() => {})
        }
        continue
      }

      if (shouldDeactivate && row.status === 'ACTIVE') {
        console.log(
          `[Cleanup] Soft-deactivating system operator '${row.system_operator_name}' (${row.id}). Reason: ${promotionEval.reasons.join(',')}. Failed syncs: ${row.failed_sync_count ?? 0}`,
        )
        await supabaseRest(`system_operators?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'INACTIVE',
            confidence_level: promotionEval.confidenceLevel,
          }),
        }).catch(() => {})
        deactivatedCount++

        await aggInsertClassificationAudit({
          providerCode: 'SYSTEM_CLEANUP',
          providerOperatorId: row.id,
          entityType: 'operator',
          entityName: row.system_operator_name,
          decision: 'REJECTED',
          classification: promotionEval.confidenceLevel,
          confidence: promotionEval.confidenceScore,
          reasonCode: promotionEval.reasons[0] || 'SOFT_DEACTIVATE',
          details: {
            country: row.country_id,
            telecomPlanCount,
            totalPlanCount,
            telecomRatio: promotionEval.telecomRatio,
            failedSyncCount: row.failed_sync_count ?? 0,
            action: 'SOFT_DEACTIVATE_CLEANUP',
          },
        }).catch(() => {})
      } else if (row.status === 'INACTIVE') {
        const updatedAt = new Date(row.updated_at || Date.now())
        if (updatedAt < cutoffDate) {
          await supabaseRest(`system_operators?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'DEPRECATED' }),
          }).catch(() => {})
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

export async function aggInsertPlanClassificationAudit(input: {
  providerCode?: string | null
  providerPlanRawId?: string | null
  providerOperatorId?: string | null
  providerPlanId?: string | null
  entityType?: string
  classification: string
  confidenceLevel: string
  confidenceScore: number
  catalogStatus: string
  matchedKeywords?: string[]
  confidenceBreakdown?: Record<string, unknown>
  rejectionReason?: string | null
  syncRunId?: string | null
}) {
  await supabaseRest('plan_classification_audit', {
    method: 'POST',
    body: JSON.stringify({
      provider_code: input.providerCode ?? null,
      provider_plan_raw_id: input.providerPlanRawId ?? null,
      provider_operator_id: input.providerOperatorId ?? null,
      provider_plan_id: input.providerPlanId ?? null,
      entity_type: input.entityType ?? 'plan',
      classification: input.classification,
      confidence_level: input.confidenceLevel,
      confidence_score: input.confidenceScore,
      catalog_status: input.catalogStatus,
      matched_keywords: input.matchedKeywords ?? [],
      confidence_breakdown: input.confidenceBreakdown ?? {},
      rejection_reason: input.rejectionReason ?? null,
      sync_run_id: input.syncRunId ?? null,
    }),
  }).catch(() => {})
}

export async function aggInsertCatalogReviewQueue(input: {
  providerCode: string
  providerOperatorId?: string | null
  providerPlanId?: string | null
  providerPlanRawId?: string | null
  entityType: string
  entityName: string
  confidenceLevel: string
  confidenceScore: number
  classification?: string | null
  catalogStatus?: string
  rawPayload?: unknown
  notes?: string | null
}) {
  await supabaseRest('catalog_review_queue', {
    method: 'POST',
    body: JSON.stringify({
      provider_code: input.providerCode,
      provider_operator_id: input.providerOperatorId ?? null,
      provider_plan_id: input.providerPlanId ?? null,
      provider_plan_raw_id: input.providerPlanRawId ?? null,
      entity_type: input.entityType,
      entity_name: input.entityName,
      confidence_level: input.confidenceLevel,
      confidence_score: input.confidenceScore,
      classification: input.classification ?? null,
      catalog_status: input.catalogStatus ?? 'REVIEW',
      raw_payload: input.rawPayload ?? null,
      notes: input.notes ?? null,
      status: 'PENDING',
    }),
  }).catch(() => {})
}

export async function aggUpsertCatalogEnrichment(input: {
  providerPlanRawId: string
  normalizedTitle?: string | null
  normalizedDescription?: string | null
  inferredServiceType?: string | null
  inferredSubservice?: string | null
  inferredValidity?: string | null
  inferredDataMb?: number | null
  inferredTalktime?: string | null
  inferredSms?: string | null
  confidenceScore: number
  enrichmentSource?: string
}) {
  await supabaseRest('catalog_enrichment?on_conflict=provider_plan_raw_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      provider_plan_raw_id: input.providerPlanRawId,
      normalized_title: input.normalizedTitle ?? null,
      normalized_description: input.normalizedDescription ?? null,
      inferred_service_type: input.inferredServiceType ?? null,
      inferred_subservice: input.inferredSubservice ?? null,
      inferred_validity: input.inferredValidity ?? null,
      inferred_data_mb: input.inferredDataMb ?? null,
      inferred_talktime: input.inferredTalktime ?? null,
      inferred_sms: input.inferredSms ?? null,
      confidence_score: input.confidenceScore,
      enrichment_source: input.enrichmentSource ?? 'title_intelligence',
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => {})
}

export async function aggPatchSystemOperatorSyncHealth(
  systemOperatorId: string,
  patch: {
    failedSyncCount?: number
    lastValidSyncAt?: string | null
    status?: string
    confidenceLevel?: string | null
    isTrustedTelecom?: boolean
  },
) {
  const body: Record<string, unknown> = {}
  if (patch.failedSyncCount != null) body.failed_sync_count = patch.failedSyncCount
  if (patch.lastValidSyncAt !== undefined) body.last_valid_sync_at = patch.lastValidSyncAt
  if (patch.status != null) body.status = patch.status
  if (patch.confidenceLevel !== undefined) body.confidence_level = patch.confidenceLevel
  if (patch.isTrustedTelecom != null) body.is_trusted_telecom = patch.isTrustedTelecom
  if (!Object.keys(body).length) return
  await supabaseRest(`system_operators?id=eq.${enc(systemOperatorId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }).catch(() => {})
}

export async function aggPatchSystemOperatorDomain(
  systemOperatorId: string,
  patch: {
    operatorDomain: string
    operatorDomainConfidence?: number
    domainClassificationSource?: string | null
    serviceDomain?: string | null
    serviceDomainConfidence?: number | null
    serviceDomainSource?: string | null
  },
) {
  await supabaseRest(`system_operators?id=eq.${enc(systemOperatorId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      operator_domain: patch.operatorDomain,
      operator_domain_confidence: patch.operatorDomainConfidence ?? null,
      domain_classification_source: patch.domainClassificationSource ?? null,
      service_domain: patch.serviceDomain ?? patch.operatorDomain ?? null,
      service_domain_confidence: patch.serviceDomainConfidence ?? patch.operatorDomainConfidence ?? null,
      service_domain_source: patch.serviceDomainSource ?? patch.domainClassificationSource ?? null,
    }),
  }).catch(() => {})
}

export async function aggInsertOperatorDomainAudit(input: {
  operatorId?: string | null
  operatorName?: string | null
  countryIso3?: string | null
  providerCode?: string | null
  detectedDomain: string
  confidence: number
  classificationSource?: string | null
  matchedRules?: string[]
  matchedKeywords?: string[]
  syncRunId?: string | null
  rejectionReason?: string | null
  domainBreakdown?: Record<string, unknown>
  registryMatch?: boolean | null
  matchMethod?: string | null
  telecomScore?: number | null
  decision?: string | null
}) {
  await supabaseRest('operator_domain_audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      operator_id: input.operatorId ?? null,
      operator_name: input.operatorName ?? null,
      country_iso3: input.countryIso3 ?? null,
      provider_code: input.providerCode ?? null,
      detected_domain: input.detectedDomain,
      confidence: input.confidence,
      classification_source: input.classificationSource ?? null,
      matched_rules: input.matchedRules ?? [],
      matched_keywords: input.matchedKeywords ?? [],
      sync_run_id: input.syncRunId ?? null,
      rejection_reason: input.rejectionReason ?? null,
      domain_breakdown: input.domainBreakdown ?? {},
      registry_match: input.registryMatch ?? null,
      match_method: input.matchMethod ?? null,
      telecom_score: input.telecomScore ?? null,
      decision: input.decision ?? null,
    }),
  }).catch(() => {})
}
