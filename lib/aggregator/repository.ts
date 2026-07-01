import { supabaseRest } from '@/lib/db/supabase-rest'
import { isTelecomSystemPlan } from './telecom-validator'
import { ISO3_TO_ISO2 } from '@/lib/lcr/countries'
import { CatalogIntelligenceEngine } from './catalog-intelligence'
import { isMobileTelecomDomain } from './catalog-intelligence/domain-registries'
import { loadCatalogIntelligenceCache } from './catalog-intelligence/brand-intelligence'
import { matchTrustedOperator } from './catalog-intelligence/trust-registry'
import { OperatorTrustEngine } from './catalog-intelligence/trust-engine'
import {
  resolveCountryIso3FromCountryId,
  upsertOperatorMergeHistory,
} from './operator-merge-history'
import type {
  AggregatorProviderRow,
  RawOperatorInput,
  RawPlanInput,
  SystemOperatorInput,
  SystemPlanInput,
} from '@/lib/aggregator/types'
import {
  groupEquivalentDisplayPlans,
  groupPlansByDisplayName,
  pickCanonicalMergeTargetPlan,
  type SystemPlanMergeRow,
} from '@/lib/aggregator/plan-display-merge'
import {
  logStep7Promotion,
  validateSystemOperatorPromotionInput,
} from '@/lib/aggregator/pipeline/step7-promotion-log'

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

/** True when multi_provider_aggregator_schema tables exist (positive result cached for process lifetime). */
export async function isAggregatorSchemaReady(): Promise<boolean> {
  if (aggregatorSchemaReady === true) return true
  try {
    const res = await supabaseRest('provider_operator_raw?select=id&limit=1', { cache: 'no-store' })
    if (res.ok) aggregatorSchemaReady = true
    return res.ok
  } catch {
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
  const row = rows[0] ?? null
  if (row?.credentials_encrypted) {
    const { reencryptPlaintextCredentialsAtRest } = await import('@/lib/aggregator/credentials')
    const updated = await reencryptPlaintextCredentialsAtRest(providerId, row.credentials_encrypted)
    if (updated) row.credentials_encrypted = updated
  }
  return row
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

export type PlanMappingRepairAction = 'repaired' | 'created' | 'unchanged' | 'synced' | 'skipped'

type PlanMappingRow = Record<string, unknown> & {
  id?: string
  system_plan_id?: string
  service_provider_id?: string
  provider_plan_id?: string | null
  provider_plan_raw_id?: string | null
  is_verified?: boolean | null
}

async function findPlanMappingByProviderPlanId(
  serviceProviderId: string,
  providerPlanId: string,
): Promise<PlanMappingRow | null> {
  const res = await supabaseRest(
    `plan_mappings?service_provider_id=eq.${enc(serviceProviderId)}&provider_plan_id=eq.${enc(providerPlanId)}&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json().catch(() => [])) as PlanMappingRow[]
  return rows[0] ?? null
}

async function findPlanMappingByTriple(
  serviceProviderId: string,
  providerPlanId: string,
  systemPlanId: string,
): Promise<PlanMappingRow | null> {
  const res = await supabaseRest(
    `plan_mappings?system_plan_id=eq.${enc(systemPlanId)}&service_provider_id=eq.${enc(serviceProviderId)}&provider_plan_id=eq.${enc(providerPlanId)}&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json().catch(() => [])) as PlanMappingRow[]
  return rows[0] ?? null
}

/**
 * Self-healing plan_mappings keyed by stable business identity:
 * (service_provider_id, provider_plan_id).
 * Refreshes provider_plan_raw_id and syncs pricing every call.
 */
export async function aggRepairOrUpsertPlanMapping(input: {
  serviceProviderId: string
  systemPlanId: string
  providerPlanId: string
  providerPlanRawId?: string | null
  matchingScore: number
  matchingReason?: string | null
  isVerified?: boolean
  verifiedBy?: string | null
  countryCode?: string | null
  providerPriority?: number
  providerActive?: boolean
  rawIndex?: Map<string, import('@/lib/aggregator/plan-mapping-reconciliation').ProviderRawPlanSnapshot>
  providerName?: string | null
  providerCode?: string | null
}): Promise<{ mapping: Record<string, unknown> | null; action: PlanMappingRepairAction }> {
  const {
    buildProviderRawPlanIndex,
    resolveLatestRawPlan,
    syncPlanMappingPricingAndAvailability,
  } = await import('@/lib/aggregator/plan-mapping-reconciliation')

  const providerPlanId = input.providerPlanId?.trim()
  if (!providerPlanId) {
    return { mapping: null, action: 'unchanged' }
  }

  const rawIndex =
    input.rawIndex ?? (await buildProviderRawPlanIndex(input.serviceProviderId))
  const resolvedRaw = resolveLatestRawPlan(input.serviceProviderId, providerPlanId, rawIndex)
  const nextRawId = resolvedRaw?.id ?? input.providerPlanRawId ?? null

  const logCtx = {
    providerId: input.serviceProviderId,
    providerName: input.providerName ?? undefined,
    providerCode: input.providerCode ?? undefined,
    providerPlanId,
    systemPlanId: input.systemPlanId,
    countryCode: input.countryCode ?? undefined,
    entity: 'plan_mapping' as const,
  }

  let existing =
    (await findPlanMappingByProviderPlanId(input.serviceProviderId, providerPlanId)) ??
    (await findPlanMappingByTriple(input.serviceProviderId, providerPlanId, input.systemPlanId))

  let mapping: PlanMappingRow | null = existing ?? null
  let action: PlanMappingRepairAction = 'unchanged'

  const patchExistingMapping = async (
    row: PlanMappingRow,
    patch: Record<string, unknown>,
    repairAction: PlanMappingRepairAction,
  ): Promise<void> => {
    if (!row.id || Object.keys(patch).length === 0) return
    const patchRes = await supabaseRest(`plan_mappings?id=eq.${enc(String(row.id))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    })
    if (!patchRes.ok) throw new Error(await patchRes.text())
    mapping = ((await patchRes.json()) as PlanMappingRow[])[0] ?? row
    action = repairAction
    logStep7Promotion({
      ...logCtx,
      operation: 'PATCH',
      reason: `mapping_${repairAction}`,
    })
  }

  if (existing?.id) {
    const verified = existing.is_verified === true
    const currentRawId = existing.provider_plan_raw_id as string | null | undefined
    const needsRawRepair = nextRawId != null && (currentRawId == null || currentRawId !== nextRawId)
    const systemPlanChanged = String(existing.system_plan_id ?? '') !== String(input.systemPlanId)

    if (systemPlanChanged && verified) {
      logStep7Promotion({
        ...logCtx,
        operation: 'SKIP',
        reason: 'verified_mapping_system_plan_preserved',
      })
      action = 'skipped'
    } else {
      const patch: Record<string, unknown> = {}
      if (needsRawRepair) patch.provider_plan_raw_id = nextRawId
      if (systemPlanChanged) patch.system_plan_id = input.systemPlanId
      if (!verified) {
        patch.matching_score = input.matchingScore
        patch.matching_reason = input.matchingReason ?? null
        patch.is_verified = input.isVerified ?? false
        patch.verified_by = input.verifiedBy ?? null
        if (input.countryCode) patch.country_code = input.countryCode
      }

      if (Object.keys(patch).length === 0) {
        action = 'unchanged'
      } else {
        patch.updated_at = new Date().toISOString()
        const repairAction: PlanMappingRepairAction =
          needsRawRepair || systemPlanChanged ? 'repaired' : 'unchanged'
        await patchExistingMapping(existing, patch, repairAction)
      }
    }
  } else {
    const insertBody = {
      service_provider_id: input.serviceProviderId,
      system_plan_id: input.systemPlanId,
      provider_plan_id: providerPlanId,
      provider_plan_raw_id: nextRawId,
      matching_score: input.matchingScore,
      matching_reason: input.matchingReason ?? null,
      is_verified: input.isVerified ?? false,
      verified_by: input.verifiedBy ?? null,
      country_code: input.countryCode ?? 'UNK',
      updated_at: new Date().toISOString(),
    }

    const res = await supabaseRest('plan_mappings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(insertBody),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      if (detail.includes('23505') || detail.toLowerCase().includes('duplicate')) {
        existing = await findPlanMappingByProviderPlanId(input.serviceProviderId, providerPlanId)
        if (existing?.id) {
          const verified = existing.is_verified === true
          const systemPlanChanged = String(existing.system_plan_id ?? '') !== String(input.systemPlanId)
          if (systemPlanChanged && verified) {
            mapping = existing
            action = 'skipped'
            logStep7Promotion({
              ...logCtx,
              operation: 'SKIP',
              reason: 'duplicate_race_verified_mapping_preserved',
            })
          } else {
            const patch: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            }
            if (nextRawId != null) patch.provider_plan_raw_id = nextRawId
            if (systemPlanChanged) patch.system_plan_id = input.systemPlanId
            if (!verified) {
              patch.matching_score = input.matchingScore
              patch.matching_reason = input.matchingReason ?? null
              if (input.countryCode) patch.country_code = input.countryCode
            }
            await patchExistingMapping(existing, patch, 'repaired')
          }
        } else {
          logStep7Promotion({
            ...logCtx,
            operation: 'SKIP',
            reason: 'duplicate_insert_unresolved',
            error: detail,
          })
          return { mapping: null, action: 'skipped' }
        }
      } else {
        logStep7Promotion({
          ...logCtx,
          operation: 'SKIP',
          reason: 'mapping_insert_failed',
          error: detail,
        })
        throw new Error(detail)
      }
    } else {
      const rows = (await res.json()) as PlanMappingRow[]
      mapping = rows[0] ?? null
      action = 'created'
      logStep7Promotion({
        ...logCtx,
        operation: 'INSERT',
        reason: 'mapping_created',
      })
    }
  }

  const pricingSystemPlanId = String(
    (mapping?.system_plan_id as string | undefined) ?? input.systemPlanId,
  )

  if (resolvedRaw) {
    await syncPlanMappingPricingAndAvailability({
      serviceProviderId: input.serviceProviderId,
      systemPlanId: pricingSystemPlanId,
      providerPlanId,
      rawPlan: resolvedRaw,
      providerPriority: input.providerPriority,
      providerActive: input.providerActive,
    })
    if (action === 'unchanged' || action === 'skipped') action = 'synced'
  }

  return { mapping, action }
}

export type PlanMappingValidationStats = {
  staleRawIdsFixed: number
  missingMappings: number
  pricingSynced: number
  mappingsProcessed: number
  availabilityUpdated: number
}

/** Repair all plan_mappings for one provider using stable provider_plan_id keys. */
export async function aggRepairStalePlanMappingsForProvider(
  providerId: string,
  options?: { providerPriority?: number; providerActive?: boolean },
): Promise<PlanMappingValidationStats> {
  const { reconcilePlanMappingsForProvider } = await import(
    '@/lib/aggregator/plan-mapping-reconciliation'
  )
  const stats = await reconcilePlanMappingsForProvider({
    providerId,
    providerPriority: options?.providerPriority,
    providerActive: options?.providerActive,
  })
  return {
    staleRawIdsFixed: stats.staleRawIdsFixed,
    missingMappings: stats.missingMappings,
    pricingSynced: stats.pricingSynced,
    mappingsProcessed: stats.mappingsProcessed,
    availabilityUpdated: stats.availabilityUpdated,
  }
}

/** Run provider-level reconciliation for every active LCR provider. */
export async function aggRepairStalePlanMappingsForAllActiveProviders(): Promise<{
  byProvider: Record<string, PlanMappingValidationStats>
  totals: PlanMappingValidationStats
}> {
  const { reconcilePlanMappingsForAllActiveProviders } = await import(
    '@/lib/aggregator/plan-mapping-reconciliation'
  )
  const { byProvider, totals } = await reconcilePlanMappingsForAllActiveProviders()
  const mapStats = (s: typeof totals): PlanMappingValidationStats => ({
    staleRawIdsFixed: s.staleRawIdsFixed,
    missingMappings: s.missingMappings,
    pricingSynced: s.pricingSynced,
    mappingsProcessed: s.mappingsProcessed,
    availabilityUpdated: s.availabilityUpdated,
  })
  return {
    byProvider: Object.fromEntries(
      Object.entries(byProvider).map(([id, stats]) => [id, mapStats(stats)]),
    ),
    totals: mapStats(totals),
  }
}

export async function aggCountProvidersBySystemPlanIds(
  systemPlanIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!systemPlanIds.length) return counts

  const uniqueIds = [...new Set(systemPlanIds)]
  const providerSets = new Map<string, Set<string>>()

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100)
    const res = await supabaseRest(
      `plan_mappings?system_plan_id=in.(${chunk.map((id) => encodeURIComponent(id)).join(',')})&select=system_plan_id,service_provider_id&limit=10000`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (!res?.ok) continue

    const rows = (await res.json()) as Array<{
      system_plan_id?: string
      service_provider_id?: string
    }>
    for (const row of rows) {
      const planId = row.system_plan_id
      const providerId = row.service_provider_id
      if (!planId || !providerId) continue
      if (!providerSets.has(planId)) providerSets.set(planId, new Set())
      providerSets.get(planId)!.add(providerId)
    }
  }

  for (const [planId, providers] of providerSets.entries()) {
    counts.set(planId, providers.size)
  }
  return counts
}

export type SystemPlanProviderLabels = {
  names: string[]
  codes: string[]
}

export async function aggProviderLabelsBySystemPlanIds(
  systemPlanIds: string[],
): Promise<Map<string, SystemPlanProviderLabels>> {
  const labelsByPlan = new Map<string, SystemPlanProviderLabels>()
  if (!systemPlanIds.length) return labelsByPlan

  const uniqueIds = [...new Set(systemPlanIds)]
  const providerSets = new Map<string, Set<string>>()

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100)
    const res = await supabaseRest(
      `plan_mappings?system_plan_id=in.(${chunk.map((id) => encodeURIComponent(id)).join(',')})&select=system_plan_id,service_provider_id&limit=10000`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (!res?.ok) continue

    const rows = (await res.json()) as Array<{
      system_plan_id?: string
      service_provider_id?: string
    }>
    for (const row of rows) {
      const planId = row.system_plan_id
      const providerId = row.service_provider_id
      if (!planId || !providerId) continue
      if (!providerSets.has(planId)) providerSets.set(planId, new Set())
      providerSets.get(planId)!.add(providerId)
    }
  }

  if (!providerSets.size) return labelsByPlan

  const providers = await aggListProviders().catch(() => [])
  const providerMetaById = new Map(
    providers.map((p) => [
      p.id,
      {
        name: (p.name || p.code || 'Unknown Provider').trim(),
        code: (p.code || '').trim(),
      },
    ]),
  )

  for (const [planId, providerIds] of providerSets.entries()) {
    const names: string[] = []
    const codes: string[] = []
    for (const id of providerIds) {
      const meta = providerMetaById.get(id)
      if (!meta) continue
      if (meta.name) names.push(meta.name)
      if (meta.code) codes.push(meta.code)
    }
    names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    codes.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    labelsByPlan.set(planId, { names, codes })
  }

  return labelsByPlan
}

export async function aggProviderNamesBySystemPlanIds(
  systemPlanIds: string[],
): Promise<Map<string, string[]>> {
  const labels = await aggProviderLabelsBySystemPlanIds(systemPlanIds)
  return new Map([...labels.entries()].map(([planId, value]) => [planId, value.names]))
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

export async function aggListRawOperators(params: {
  limit?: number
  offset?: number
  country?: string
  providerId?: string
  q?: string
}) {
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
    const needle = params.q?.trim()
    if (needle) {
      const encoded = enc(needle)
      q.push(`or=(provider_operator_name.ilike.*${encoded}*,provider_operator_id.ilike.*${encoded}*)`)
    }
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

export async function aggListSystemOperators(params: {
  country?: string
  q?: string
  limit?: number
  offset?: number
  status?: string
  includeAllStatus?: boolean
  operatorDomain?: string
  serviceDomain?: string
  mobileCatalogOnly?: boolean
  confidenceLevel?: string
}) {
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
    if (params.confidenceLevel) filters.push(`confidence_level=eq.${enc(params.confidenceLevel)}`)
    if (params.q) filters.push(`system_operator_name=ilike.*${enc(params.q)}*`)
    if (params.serviceDomain) {
      filters.push(`service_domain=eq.${enc(params.serviceDomain)}`)
    } else if (params.mobileCatalogOnly) {
      filters.push('or=(service_domain.eq.MOBILE,service_domain.is.null)')
    } else if (params.operatorDomain) {
      filters.push(`operator_domain=eq.${enc(params.operatorDomain)}`)
    }
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

export async function aggListSystemPlans(params: {
  systemOperatorId?: string
  q?: string
  limit?: number
  offset?: number
  mobileCatalogOnly?: boolean
  serviceDomain?: string
  confidenceLevel?: string
}) {
  const filters = [
    'select=*',
    'status=eq.ACTIVE',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=amount.asc',
  ]
  if (params.mobileCatalogOnly) {
    filters.push('or=(service_domain.eq.MOBILE,service_domain.is.null)')
  } else if (params.serviceDomain) {
    filters.push(`service_domain=eq.${enc(params.serviceDomain)}`)
  }
  if (params.systemOperatorId) filters.push(`system_operator_id=eq.${enc(params.systemOperatorId)}`)
  if (params.confidenceLevel) filters.push(`confidence_level=eq.${enc(params.confidenceLevel)}`)
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
  const { trustedOperators, domainRegistry, nonTelecomRegistry } = await aggLoadCatalogIntelligenceRegistries().catch(() => ({
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

    // Register the source operator's name as an alias for the target operator
    await OperatorTrustEngine.learnFromAliasMapping(
      targetOperatorId,
      sourceOperator.system_operator_name,
      targetOperator.country_id || '*',
      'ADMIN_MERGE'
    ).catch(err => {
      console.error('[Merge] Failed to record alias learning for source operator:', err)
    })

    const countryIso3 = await resolveCountryIso3FromCountryId(targetOperator.country_id)
    if (countryIso3) {
      await upsertOperatorMergeHistory({
        countryIso3,
        sourceOperatorName: sourceOperator.system_operator_name,
        targetOperatorName: targetOperator.system_operator_name,
        mergeReason: 'ADMIN_MERGE',
        mergedByAdmin: actorEmail,
        isActive: true,
      }).catch((err) => {
        console.error('[Merge] Failed to record operator merge history:', err)
      })

      console.log(
        `[history][operator] Saved merge history source=${sourceOperator.system_operator_name} target=${targetOperator.system_operator_name} country=${countryIso3}`,
      )
    }

    // Delete the source operator
    await supabaseRest(`system_operators?id=eq.${encodeURIComponent(sourceId)}`, {
      method: 'DELETE',
    })

    logs.push(`Merged system operator '${sourceOperator.system_operator_name}' (${sourceId}) into '${targetOperator.system_operator_name}' (${targetOperatorId})`)
  }

  // Verify and boost the trust score of the target operator
  await OperatorTrustEngine.learnFromAdminApproval(
    targetOperatorId,
    targetOperator.system_operator_name,
    targetOperator.country_id || '*',
    actorEmail
  ).catch(err => {
    console.error('[Merge] Failed target operator admin approval learning:', err)
  })

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

export async function aggMergeInternalPlans(targetPlanId: string, sourcePlanIds: string[], actorEmail: string = 'system') {
  // 1. Verify target plan exists
  const targetRes = await supabaseRest(
    `internal_plans?id=eq.${encodeURIComponent(targetPlanId)}&select=*&limit=1`,
    { cache: 'no-store' }
  )
  if (!targetRes.ok) throw new Error(`Failed to check target plan: ${await targetRes.text()}`)
  const targetRows = await targetRes.json() as any[]
  if (targetRows.length === 0) {
    throw new Error('Target plan not found')
  }
  const targetPlan = targetRows[0]

  const logs: string[] = []

  // 2. Process each source plan
  for (const sourceId of sourcePlanIds) {
    if (sourceId === targetPlanId) continue

    // Get source plan info for logging
    const sourceRes = await supabaseRest(
      `internal_plans?id=eq.${encodeURIComponent(sourceId)}&select=*&limit=1`,
      { cache: 'no-store' }
    )
    if (!sourceRes.ok) continue
    const sourceRows = await sourceRes.json() as any[]
    if (sourceRows.length === 0) continue
    const sourcePlan = sourceRows[0]

    // 2.1 Update lcr_v2_recharge_attempts
    await supabaseRest(`lcr_v2_recharge_attempts?internal_plan_id=eq.${encodeURIComponent(sourceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ internal_plan_id: targetPlanId }),
    }).catch((err) => console.error('Failed to update attempts:', err))

    // 2.2 Update internal_plan_provider_mapping
    const mappingsRes = await supabaseRest(
      `internal_plan_provider_mapping?internal_plan_id=eq.${encodeURIComponent(sourceId)}&select=*`,
      { cache: 'no-store' }
    )
    if (mappingsRes.ok) {
      const mappings = await mappingsRes.json() as any[]
      for (const m of mappings) {
        // Check if target plan already has this mapping
        const conflictRes = await supabaseRest(
          `internal_plan_provider_mapping?internal_plan_id=eq.${encodeURIComponent(
            targetPlanId
          )}&provider_id=eq.${encodeURIComponent(m.provider_id)}&provider_plan_id=eq.${encodeURIComponent(
            m.provider_plan_id
          )}&select=id&limit=1`,
          { cache: 'no-store' }
        )
        const conflictRows = conflictRes.ok ? await conflictRes.json() as any[] : []
        if (conflictRows.length > 0) {
          // Mapping conflict, delete the source mapping
          await supabaseRest(`internal_plan_provider_mapping?id=eq.${encodeURIComponent(m.id)}`, {
            method: 'DELETE',
          })
        } else {
          // No conflict, patch the mapping to point to targetPlanId
          await supabaseRest(`internal_plan_provider_mapping?id=eq.${encodeURIComponent(m.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ internal_plan_id: targetPlanId }),
          })
        }
      }
    }

    // 2.3 Update system_plans
    await supabaseRest(`system_plans?internal_plan_id=eq.${encodeURIComponent(sourceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ internal_plan_id: targetPlanId }),
    }).catch((err) => console.error('Failed to update system_plans:', err))

    // 2.4 Delete the source plan
    await supabaseRest(`internal_plans?id=eq.${encodeURIComponent(sourceId)}`, {
      method: 'DELETE',
    })

    logs.push(`Merged plan '${sourcePlan.uti_plan_name || sourceId}' into '${targetPlan.uti_plan_name || targetPlanId}'`)
  }

  // Audit Log
  await aggAudit({
    actor: actorEmail,
    action: 'plans.merge',
    entityType: 'internal_plan',
    entityId: targetPlanId,
    after: targetPlan,
    details: {
      targetPlanId,
      sourcePlanIds,
      logs,
    },
  }).catch(() => {})

  return { success: true, logs }
}

async function repointPlanMappingsForSystemPlanMerge(
  targetSystemPlanId: string,
  sourceSystemPlanId: string,
): Promise<void> {
  const mappingsRes = await supabaseRest(
    `plan_mappings?system_plan_id=eq.${enc(sourceSystemPlanId)}&select=id,service_provider_id,provider_plan_raw_id`,
    { cache: 'no-store' },
  )
  if (!mappingsRes.ok) return

  const mappings = (await mappingsRes.json()) as Array<{
    id: string
    service_provider_id: string
    provider_plan_raw_id: string
  }>

  for (const mapping of mappings) {
    const existingRes = await supabaseRest(
      `plan_mappings?service_provider_id=eq.${enc(mapping.service_provider_id)}&provider_plan_raw_id=eq.${enc(mapping.provider_plan_raw_id)}&system_plan_id=eq.${enc(targetSystemPlanId)}&select=id&limit=1`,
      { cache: 'no-store' },
    )
    if (existingRes.ok) {
      const existing = (await existingRes.json()) as Array<{ id: string }>
      if (existing.length > 0) {
        await supabaseRest(`plan_mappings?id=eq.${enc(mapping.id)}`, { method: 'DELETE' })
        continue
      }
    }

    await supabaseRest(`plan_mappings?id=eq.${enc(mapping.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ system_plan_id: targetSystemPlanId }),
    })
  }

  await supabaseRest(
    `duplicate_plan_suggestions?suggested_system_plan_id=eq.${enc(sourceSystemPlanId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ suggested_system_plan_id: targetSystemPlanId }),
    },
  )
}

export async function aggMergeSystemPlans(targetSystemPlanId: string, sourceSystemPlanIds: string[], actorEmail: string = 'system') {
  // 1. Verify target system plan exists
  const targetRes = await supabaseRest(
    `system_plans?id=eq.${encodeURIComponent(targetSystemPlanId)}&select=*&limit=1`,
    { cache: 'no-store' }
  )
  if (!targetRes.ok) throw new Error(`Failed to check target system plan: ${await targetRes.text()}`)
  const targetRows = await targetRes.json() as any[]
  if (targetRows.length === 0) {
    throw new Error('Target system plan not found')
  }
  const targetSystemPlan = targetRows[0]
  let targetInternalPlanId = targetSystemPlan.internal_plan_id as string | null | undefined

  const logs: string[] = []

  // 2. Process each source system plan
  for (const sourceId of sourceSystemPlanIds) {
    if (sourceId === targetSystemPlanId) continue

    // Get source plan info
    const sourceRes = await supabaseRest(
      `system_plans?id=eq.${encodeURIComponent(sourceId)}&select=*&limit=1`,
      { cache: 'no-store' }
    )
    if (!sourceRes.ok) continue
    const sourceRows = await sourceRes.json() as any[]
    if (sourceRows.length === 0) continue
    const sourcePlan = sourceRows[0]
    const sourceInternalPlanId = sourcePlan.internal_plan_id as string | null | undefined

    if (!targetInternalPlanId && sourceInternalPlanId) {
      targetInternalPlanId = sourceInternalPlanId
      await supabaseRest(`system_plans?id=eq.${encodeURIComponent(targetSystemPlanId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ internal_plan_id: targetInternalPlanId }),
      })
      targetSystemPlan.internal_plan_id = targetInternalPlanId
    }

    // If there is an internal plan, merge it
    if (
      targetInternalPlanId &&
      sourceInternalPlanId &&
      sourceInternalPlanId !== targetInternalPlanId
    ) {
      const mergeInternalRes = await aggMergeInternalPlans(targetInternalPlanId, [sourceInternalPlanId], actorEmail)
      if (mergeInternalRes.success) {
        logs.push(...mergeInternalRes.logs)
      }
    }

    await repointPlanMappingsForSystemPlanMerge(targetSystemPlanId, sourceId)

    // Delete the source system plan
    await supabaseRest(`system_plans?id=eq.${encodeURIComponent(sourceId)}`, {
      method: 'DELETE',
    })

    logs.push(`Merged system plan '${sourcePlan.system_plan_name || sourceId}' into '${targetSystemPlan.system_plan_name || targetSystemPlanId}'`)
  }

  // Audit Log
  await aggAudit({
    actor: actorEmail,
    action: 'system_plans.merge',
    entityType: 'system_plan',
    entityId: targetSystemPlanId,
    after: targetSystemPlan,
    details: {
      targetSystemPlanId,
      sourceSystemPlanIds,
      logs,
    },
  }).catch(() => {})

  return { success: true, logs }
}

export function getNormalizedBaseName(name: string, countryName: string, iso2: string, iso3: string): string {
  let normalized = name.toLowerCase();

  // Remove full country name
  if (countryName) {
    const escapedCountryName = countryName.toLowerCase().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    normalized = normalized.replace(new RegExp(`\\b${escapedCountryName}\\b`, 'gi'), '');
    
    // Clean country name to get base name (e.g. "Republic of The Gambia" -> "gambia")
    let cleaned = countryName.toLowerCase();
    if (cleaned.includes('united kingdom')) {
      cleaned = 'united kingdom';
    } else if (cleaned.includes('united states')) {
      cleaned = 'united states';
    } else if (cleaned.includes('russian federation') || cleaned.includes('russia')) {
      cleaned = 'russia';
    } else {
      cleaned = cleaned
        .replace(/\b(republic of|republic|the|independent state of|state of|kingdom of|union of|democratic republic of|federative republic of|islamic republic of|people's democratic republic of|sultanate of|cooperative republic of|pluralistic state of|principality of|grand duchy of|commonwealth of|socialist state of|federation)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
      
    if (cleaned && cleaned !== countryName.toLowerCase()) {
      const escapedCleaned = cleaned.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      normalized = normalized.replace(new RegExp(`\\b${escapedCleaned}\\b`, 'gi'), '');
    }
  }

  // Remove iso3 code
  if (iso3) {
    normalized = normalized.replace(new RegExp(`\\b${iso3.toLowerCase()}\\b`, 'gi'), '');
  }

  // Remove iso2 code
  if (iso2) {
    normalized = normalized.replace(new RegExp(`\\b${iso2.toLowerCase()}\\b`, 'gi'), '');
  }

  // Custom aliases for specific countries
  if (iso3 === 'ARE') {
    normalized = normalized.replace(/\buae\b/gi, '');
  }
  if (iso3 === 'GBR') {
    normalized = normalized.replace(/\buk\b/gi, '');
  }

  // Remove common generic prefixes/suffixes and plan details from operator names
  normalized = normalized.replace(/\b(topup|top-up|prepaid|postpaid|data|bundle|bundles|internet|telecom|mobile|plan|plans|recharge|refill|load|airtime|credit|minutes|minute|min|days|day|gb|mb|kb|tb)\b/gi, '');

  // Remove currency codes (3-letter codes)
  normalized = normalized.replace(/\b(dzd|gmd|usd|eur|inr|egp|yer|sar|qar|omr|kwd|bhd|mad|jod|lyd|sdg|tnd|iqd|aed|gbp|cad|aud|cny|jpy|rub|try|brl|mxn|php|pkb|lkr|npr|bra|cop|zar|efy|idr|myr|sgd|thb|vnd|xaf|xof|rwf|mga|mwk|szl|lsl|nad|bwp|szl|mur|scr|kmf|djf|sos|etb|ssp|sdg|ern)\b/gi, '');

  // Remove digit patterns (e.g. 400, 2000, 10gb, 3gb)
  normalized = normalized.replace(/\b\d+(gb|mb|kb|min|days|day|d)?\b/gi, '');

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Telecom Alias Consolidation
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (compact === 'reliancejio' || compact === 'jioindia' || compact === 'jio') {
    return 'jio';
  }
  if (compact === 'vodafoneidea' || compact === 'vi' || compact === 'vodafoneideaindia') {
    return 'vi';
  }
  if (compact === 'vodafoneindia' || compact === 'vodafone') {
    return 'vodafone';
  }
  if (compact === 'bsnlindia' || compact === 'bsnl') {
    return 'bsnl';
  }
  if (compact === 'airtelindia' || compact === 'airtel') {
    return 'airtel';
  }
  if (compact === 'mtnlindia' || compact === 'mtnl') {
    return 'mtnl';
  }

  return normalized;
}

export async function aggMergeDuplicateSystemOperators(actorEmail: string = 'system-automerge'): Promise<number> {
  console.log(`[Auto-Merge] Starting database system operators merge check...`)
  
  // 1. Fetch all system operators
  let offset = 0
  let hasMore = true
  const systemOperators: any[] = []

  while (hasMore) {
    const res = await supabaseRest(
      `system_operators?select=id,system_operator_name,country_id,status,confidence_level,is_trusted_telecom,failed_sync_count,last_valid_sync_at,operator_domain,service_domain&limit=1000&offset=${offset}`,
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
    systemOperators.push(...rows)
    if (rows.length < 1000) {
      hasMore = false
    } else {
      offset += 1000
    }
  }

  if (systemOperators.length === 0) return 0

  // 2. Fetch countries
  const countriesRes = await supabaseRest('countries?select=id,name,iso2,iso3&limit=500', { cache: 'no-store' }).catch(() => null)
  const countries = countriesRes?.ok ? (await countriesRes.json() as any[]) : []
  const countryMap = new Map(countries.map(c => [c.id.toUpperCase(), c]))

  const confidenceRank: Record<string, number> = {
    'HIGH_CONFIDENCE_TELECOM': 4,
    'MEDIUM_CONFIDENCE_TELECOM': 3,
    'LOW_CONFIDENCE_TELECOM': 2,
    'UNKNOWN': 1,
    'SUSPICIOUS_NON_TELECOM': 0,
    'CONFIRMED_NON_TELECOM': -1
  }

  // 3. Group operators by country and normalized base name
  const groups = new Map<string, any[]>()
  for (const op of systemOperators) {
    const countryData = countryMap.get(op.country_id.toUpperCase())
    if (!countryData) continue

    const normalized = getNormalizedBaseName(op.system_operator_name, countryData.name, countryData.iso2, countryData.iso3)
    if (!normalized) continue

    const key = `${op.country_id.toUpperCase()}:${normalized}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)?.push(op)
  }

  let mergedCount = 0

  for (const [key, ops] of groups.entries()) {
    if (ops.length >= 2) {
      // Find canonical target operator
      const sorted = [...ops].sort((a, b) => {
        if (Boolean(a.is_trusted_telecom) !== Boolean(b.is_trusted_telecom)) {
          return a.is_trusted_telecom ? -1 : 1
        }
        if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
        if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1

        const rankA = confidenceRank[a.confidence_level] ?? 1
        const rankB = confidenceRank[b.confidence_level] ?? 1
        if (rankA !== rankB) return rankB - rankA

        if (a.system_operator_name.length !== b.system_operator_name.length) {
          return a.system_operator_name.length - b.system_operator_name.length
        }

        return a.id.localeCompare(b.id)
      })

      const target = sorted[0]
      const sources = sorted.slice(1)

      // Find the maximum confidence level among all merged operators
      let maxConfidenceLevel = target.confidence_level || 'UNKNOWN'
      let maxRank = confidenceRank[maxConfidenceLevel] ?? 1
      for (const op of ops) {
        const rank = confidenceRank[op.confidence_level] ?? 1
        if (rank > maxRank) {
          maxRank = rank
          maxConfidenceLevel = op.confidence_level
        }
      }

      try {
        console.log(`[Auto-Merge] Merging duplicate operators for group ${key}: target is '${target.system_operator_name}' (${target.id}), sources are:`, sources.map(s => `'${s.system_operator_name}' (${s.id})`))
        const mergeResult = await aggMergeSystemOperators(target.id, sources.map(s => s.id), actorEmail)
        if (mergeResult.success) {
          // Update the target operator status to 'ACTIVE' and confidence level to maxConfidenceLevel
          await supabaseRest(`system_operators?id=eq.${target.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'ACTIVE',
              confidence_level: maxConfidenceLevel,
              updated_at: new Date().toISOString()
            })
          }).catch((err) => {
            console.error(`[Auto-Merge] Failed to patch target operator ${target.id}:`, err)
          })
          mergedCount += sources.length
        }
      } catch (err) {
        console.error(`[Auto-Merge] Failed to merge group ${key}:`, err)
      }
    }
  }

  return mergedCount
}

async function fetchSystemPlansByIds(
  systemPlanIds: string[],
  select: string,
): Promise<SystemPlanMergeRow[]> {
  const systemPlans: SystemPlanMergeRow[] = []
  for (let i = 0; i < systemPlanIds.length; i += 100) {
    const chunk = systemPlanIds.slice(i, i + 100)
    const res = await supabaseRest(
      `system_plans?id=in.(${chunk.map(enc).join(',')})&select=${select}`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    systemPlans.push(...((await res.json()) as SystemPlanMergeRow[]))
  }
  return systemPlans
}

async function fetchSystemPlansForOperators(
  operatorIds: string[],
  select: string,
): Promise<SystemPlanMergeRow[]> {
  const systemPlans: SystemPlanMergeRow[] = []
  for (let i = 0; i < operatorIds.length; i += 50) {
    const chunk = operatorIds.slice(i, i + 50)
    const res = await supabaseRest(
      `system_plans?system_operator_id=in.(${chunk.map(enc).join(',')})&select=${select}`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    systemPlans.push(...((await res.json()) as SystemPlanMergeRow[]))
  }
  return systemPlans
}

async function mergeSystemPlanGroups(
  groups: Map<string, SystemPlanMergeRow[]>,
  actorEmail: string,
  logLabel: string,
): Promise<number> {
  let mergedCount = 0
  for (const plans of groups.values()) {
    if (plans.length < 2) continue

    const target = pickCanonicalMergeTargetPlan(plans)
    if (!target?.id) continue

    const sources = plans
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id) && id !== target.id)
    if (!sources.length) continue

    try {
      const mergeResult = await aggMergeSystemPlans(target.id, sources, actorEmail)
      if (mergeResult.success) mergedCount += sources.length
    } catch (err) {
      console.error(`[Auto-Merge] Failed to merge duplicate system plans (${logLabel}):`, err)
    }
  }
  return mergedCount
}

function normalizeValidityKey(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function normalizeDestinationAmount(value: unknown): string | null {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return String(Number(amount.toFixed(4)))
}

async function loadRawDestinationByIds(
  rawIds: string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>()
  if (!rawIds.length) return map

  for (let i = 0; i < rawIds.length; i += 100) {
    const chunk = rawIds.slice(i, i + 100)
    const res = await supabaseRest(
      `provider_plans_raw?id=in.(${chunk.map(enc).join(',')})&select=id,destination_amount`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{ id?: string; destination_amount?: number | null }>
    for (const row of rows) {
      if (row.id) map.set(row.id, row.destination_amount ?? null)
    }
  }
  return map
}

/** Merge duplicate system_plans that share the same operator + normalized_signature for this provider sync. */
async function aggMergeDuplicateSystemPlansBySignatureForProvider(
  providerId: string,
  actorEmail: string = 'system-sync',
): Promise<number> {
  const mappingsRes = await supabaseRest(
    `plan_mappings?service_provider_id=eq.${enc(providerId)}&select=system_plan_id`,
    { cache: 'no-store' },
  )
  if (!mappingsRes.ok) return 0

  const mappings = (await mappingsRes.json()) as Array<{ system_plan_id?: string | null }>
  const systemPlanIds = Array.from(
    new Set(mappings.map((row) => row.system_plan_id).filter((id): id is string => Boolean(id))),
  )
  if (systemPlanIds.length === 0) return 0

  const systemPlans = await fetchSystemPlansByIds(
    systemPlanIds,
    'id,system_operator_id,normalized_signature,country_code,status,created_at,internal_plan_id,system_plan_name',
  )

  const groups = new Map<string, SystemPlanMergeRow[]>()
  for (const plan of systemPlans) {
    const signature = String(plan.normalized_signature ?? '').trim()
    const operatorId = String(plan.system_operator_id ?? '').trim()
    const countryCode = (String(plan.country_code ?? 'UNK').trim().toUpperCase()) || 'UNK'
    if (!signature || !operatorId) continue
    const key = `${countryCode}:${operatorId}:${providerId}:${signature}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(plan)
  }

  return mergeSystemPlanGroups(groups, actorEmail, 'signature')
}

/**
 * Merge duplicate system_plans with the same country, operator, recharge value,
 * validity, and provider_plan_id for this provider sync.
 */
async function aggMergeDuplicateSystemPlansByRechargeIdentityForProvider(
  providerId: string,
  actorEmail: string = 'system-sync',
): Promise<number> {
  const mappingsRes = await supabaseRest(
    `plan_mappings?service_provider_id=eq.${enc(providerId)}&select=system_plan_id,provider_plan_id,provider_plan_raw_id`,
    { cache: 'no-store' },
  )
  if (!mappingsRes.ok) return 0

  const mappings = (await mappingsRes.json()) as Array<{
    system_plan_id?: string | null
    provider_plan_id?: string | null
    provider_plan_raw_id?: string | null
  }>
  if (!mappings.length) return 0

  const systemPlanIds = Array.from(
    new Set(mappings.map((row) => row.system_plan_id).filter((id): id is string => Boolean(id))),
  )
  if (!systemPlanIds.length) return 0

  const systemPlans = await fetchSystemPlansByIds(
    systemPlanIds,
    'id,system_operator_id,country_code,validity,normalized_signature,status,created_at,internal_plan_id,system_plan_name',
  )
  const planById = new Map(systemPlans.map((plan) => [plan.id, plan]))

  const rawIds = Array.from(
    new Set(
      mappings
        .map((row) => row.provider_plan_raw_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const rawDestinationById = await loadRawDestinationByIds(rawIds)

  const groups = new Map<string, SystemPlanMergeRow[]>()
  for (const mapping of mappings) {
    const planId = mapping.system_plan_id
    const providerPlanId = mapping.provider_plan_id?.trim()
    if (!planId || !providerPlanId) continue

    const plan = planById.get(planId)
    if (!plan) continue

    const operatorId = String(plan.system_operator_id ?? '').trim()
    const countryCode = (String(plan.country_code ?? 'UNK').trim().toUpperCase()) || 'UNK'
    const validity = normalizeValidityKey(plan.validity)
    if (!operatorId || !validity) continue

    const destinationAmount = normalizeDestinationAmount(
      mapping.provider_plan_raw_id
        ? rawDestinationById.get(mapping.provider_plan_raw_id)
        : null,
    )
    if (!destinationAmount) continue

    const key = `${countryCode}:${operatorId}:${providerId}:${destinationAmount}:${validity}:${providerPlanId}`
    if (!groups.has(key)) groups.set(key, [])
    const bucket = groups.get(key)!
    if (!bucket.some((row) => row.id === plan.id)) bucket.push(plan)
  }

  return mergeSystemPlanGroups(groups, actorEmail, 'recharge-identity')
}

async function loadOperatorPlansForProviderMerge(
  providerId: string,
  select: string,
): Promise<SystemPlanMergeRow[]> {
  const mappingsRes = await supabaseRest(
    `plan_mappings?service_provider_id=eq.${enc(providerId)}&select=system_plan_id`,
    { cache: 'no-store' },
  )
  if (!mappingsRes.ok) return []

  const mappings = (await mappingsRes.json()) as Array<{ system_plan_id?: string | null }>
  const mappedPlanIds = Array.from(
    new Set(mappings.map((row) => row.system_plan_id).filter((id): id is string => Boolean(id))),
  )
  if (!mappedPlanIds.length) return []

  const mappedPlans = await fetchSystemPlansByIds(mappedPlanIds, 'id,system_operator_id')
  const operatorIds = Array.from(
    new Set(
      mappedPlans
        .map((plan) => plan.system_operator_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  if (!operatorIds.length) return []

  return fetchSystemPlansForOperators(operatorIds, select)
}

/**
 * Merge duplicate system_plans with identical country, operator, display name, amount, and currency.
 */
async function aggMergeDuplicateSystemPlansByDisplayNameForProvider(
  providerId: string,
  actorEmail: string = 'system-sync',
): Promise<number> {
  const operatorPlans = await loadOperatorPlansForProviderMerge(
    providerId,
    'id,system_operator_id,system_plan_name,country_code,amount,currency,validity,data_volume,sms,talktime,plan_type,normalized_signature,status,created_at,internal_plan_id',
  )
  if (!operatorPlans.length) return 0

  const groups = groupPlansByDisplayName(operatorPlans)
  return mergeSystemPlanGroups(groups, actorEmail, 'display-name')
}

/**
 * Merge duplicate system_plans under the same country + operator when plan features match
 * and the same local retail price appears in each plan name (e.g. INR 299 vs 299.00 INR).
 */
export async function aggMergeEquivalentDisplayPlansForProvider(
  providerId: string,
  actorEmail: string = 'system-sync',
): Promise<number> {
  const operatorPlans = await loadOperatorPlansForProviderMerge(
    providerId,
    'id,system_operator_id,system_plan_name,country_code,amount,currency,validity,data_volume,sms,talktime,plan_type,normalized_signature,status,created_at,internal_plan_id',
  )
  if (!operatorPlans.length) return 0

  const groups = groupEquivalentDisplayPlans(operatorPlans)
  return mergeSystemPlanGroups(groups, actorEmail, 'display-price')
}

/** Post-sync merge: signature, recharge identity, display name, then display-price duplicates. */
export async function aggMergeDuplicateSystemPlansForProvider(
  providerId: string,
  actorEmail: string = 'system-sync',
): Promise<number> {
  const signatureMerged = await aggMergeDuplicateSystemPlansBySignatureForProvider(providerId, actorEmail)
  const rechargeMerged = await aggMergeDuplicateSystemPlansByRechargeIdentityForProvider(providerId, actorEmail)
  const displayNameMerged = await aggMergeDuplicateSystemPlansByDisplayNameForProvider(providerId, actorEmail)
  const displayMerged = await aggMergeEquivalentDisplayPlansForProvider(providerId, actorEmail)
  return signatureMerged + rechargeMerged + displayNameMerged + displayMerged
}

export async function aggLoadTrustedOperators(): Promise<
  Array<{
    normalizedName: string
    displayName: string
    countryCode: string
    trustLevel: string
    isVerifiedTelecom: boolean
    trustScore?: number
    canonicalOperatorId?: string | null
    source?: string
  }>
> {
  const [registryRes, aliasesRes] = await Promise.all([
    supabaseRest('operator_trust_registry?or=(is_verified.eq.true,trust_score.gte.70)&select=*', { cache: 'no-store' }),
    supabaseRest('operator_aliases?confidence_score.gte.70&select=*', { cache: 'no-store' })
  ]).catch(() => [null, null])

  const pool: any[] = []
  
  if (registryRes?.ok) {
    const rows = await registryRes.json() as any[]
    for (const r of rows) {
      pool.push({
        normalizedName: r.normalized_name,
        displayName: r.display_name || r.normalized_name,
        countryCode: r.country_code || '*',
        trustLevel: r.trust_level || (r.trust_score >= 90 ? 'VERIFIED' : 'TRUSTED'),
        isVerifiedTelecom: r.is_verified || r.trust_score >= 90,
        trustScore: Number(r.trust_score || 0),
        canonicalOperatorId: r.canonical_operator_id,
        source: r.source || 'TRUST_REGISTRY'
      })
    }
  }

  if (aliasesRes?.ok) {
    const rows = await aliasesRes.json() as any[]
    for (const r of rows) {
      pool.push({
        normalizedName: r.normalized_alias || r.alias_name.toUpperCase(),
        displayName: r.alias_name,
        countryCode: r.country_code || '*',
        trustLevel: r.confidence_score >= 90 ? 'VERIFIED' : 'TRUSTED',
        isVerifiedTelecom: r.confidence_score >= 70,
        trustScore: Number(r.confidence_score || 0),
        canonicalOperatorId: r.canonical_operator_id,
        source: 'ALIAS_MATCH'
      })
    }
  }

  return pool
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

export async function aggLoadOperatorDomainRegistry(): Promise<
  Array<{ normalizedName: string; operatorName: string; operatorDomain: string; confidence: number; countryIso3?: string | null }>
> {
  const res = await supabaseRest(
    'operator_domain_registry?is_verified=eq.true&select=operator_name,normalized_name,operator_domain,confidence,country_iso3',
    { cache: 'no-store' },
  ).catch(() => null)
  if (!res?.ok) return []
  const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    normalizedName: String(row.normalized_name ?? ''),
    operatorName: String(row.operator_name ?? row.normalized_name ?? ''),
    operatorDomain: String(row.operator_domain ?? 'UNKNOWN'),
    confidence: Number(row.confidence ?? 90),
    countryIso3: row.country_iso3 ? String(row.country_iso3) : null,
  }))
}

export async function aggLoadNonTelecomOperatorRegistry(): Promise<
  Array<{ normalizedName: string; operatorName: string; operatorDomain: string; confidence: number }>
> {
  const res = await supabaseRest(
    'non_telecom_operator_registry?is_verified=eq.true&select=operator_name,normalized_name,operator_domain,confidence',
    { cache: 'no-store' },
  ).catch(() => null)
  if (!res?.ok) return []
  const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    normalizedName: String(row.normalized_name ?? ''),
    operatorName: String(row.operator_name ?? row.normalized_name ?? ''),
    operatorDomain: String(row.operator_domain ?? 'RETAIL'),
    confidence: Number(row.confidence ?? 95),
  }))
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

export async function aggLoadCatalogIntelligenceRegistries() {
  await loadCatalogIntelligenceCache().catch(err => {
    console.error(`[Cache] Failed to load catalog intelligence cache:`, err)
  })

  const [trustedOperators, domainRegistry, nonTelecomRegistry] = await Promise.all([
    aggLoadTrustedOperators(),
    aggLoadOperatorDomainRegistry(),
    aggLoadNonTelecomOperatorRegistry(),
  ])
  return { trustedOperators, domainRegistry, nonTelecomRegistry }
}
