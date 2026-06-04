import { getConnector } from '@/lib/providers/registry'
import type { NormalizedPlan, ProviderConfig } from '@/lib/providers/types'
import { fingerprintPlan } from '@/lib/uti/normalize'
import {
  dbCreateInternalPlan,
  dbFindInternalPlanByHash,
  dbUpsertInternalPlanMapping,
} from '@/lib/uti/repository'
import { cacheDelByPrefix } from '@/lib/cache/redis'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'
import {
  classifyProviderOperatorRecord,
  formatSkippedOperatorLog,
  isGenuineTelecomOperatorName,
  operatorNameConfidenceScore,
  operatorTypeForKind,
  resolveTelecomOperatorName,
} from '@/lib/aggregator/operator-classifier'
import {
  canUseDynamicClassification,
  classifyTelecomRecordDynamic,
  normalizeOperatorNameDynamic,
  scoreAggregateOperatorCandidate,
} from '@/lib/aggregator/dynamic-classifier'
import {
  aggInsertTransformAudit,
  aggUpsertAggregateOperator,
  aggUpsertAggregateOperatorMapping,
  aggUpsertOperatorAlias,
  aggUpsertSystemOperatorLineage,
} from '@/lib/aggregator/dynamic-repository'
import {
  createSyncDiagnostics,
  logCountryMapping,
  logOperatorDecision,
  printPipelineReport,
  summarizeDiagnostics,
} from '@/lib/aggregator/sync-diagnostics'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'
import { buildSystemOperatorInput } from '@/lib/aggregator/operator-normalizer'
import { buildSystemPlanInput, scorePlanCandidate } from '@/lib/aggregator/plan-normalizer'
import { extractPlanSignatureParts, sha256 } from '@/lib/aggregator/signature'
import type { AggregatorSyncResult } from '@/lib/aggregator/types'
import type { SyncCatalogOptions } from '@/lib/lcr/sync-options'
import { resolveSyncCountries } from '@/lib/lcr/sync-options'
import {
  aggFindSystemPlanCandidates,
  aggGetProvider,
  aggInsertSyncLog,
  aggPatchProvider,
  aggUpsertDuplicateSuggestion,
  aggUpsertOperatorMapping,
  aggUpsertPlanMapping,
  aggUpsertRawOperator,
  aggUpsertRawPlan,
  aggUpsertSystemOperator,
  aggUpsertSystemPlan,
  aggUpsertFilteredOperator,
  aggCleanupSystemOperatorsWithoutPlans,
} from '@/lib/aggregator/repository'
import { classifyOperatorByPlans } from '@/lib/aggregator/telecom-classifier'

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function rawOperatorFromPlan(plan: NormalizedPlan) {
  const raw: any = plan.raw ?? {}
  const operator = raw?.operator ?? {}
  const country = operator?.country ?? {}
  const providerOperatorId = safeString(operator?.id || plan.operatorRef)
  const providerOperatorName = safeString(operator?.name || plan.operatorName || plan.operatorRef)
  return {
    providerOperatorId,
    providerOperatorName,
    countryCode: safeString(country?.iso_code || plan.countryIso3).toUpperCase() || plan.countryIso3,
    isoCode: safeString(country?.iso_code || plan.countryIso3).toUpperCase() || plan.countryIso3,
    mobileCountryCode: safeString(country?.mobile_country_code || country?.mcc) || null,
    logo: safeString(operator?.logo || operator?.logo_url) || null,
    operatorType: safeString(operator?.type || plan.service) || 'Mobile',
    currency: safeString(raw?.prices?.retail?.unit || plan.retailCurrency) || null,
    rawResponseJson: operator && Object.keys(operator).length ? operator : { operatorRef: plan.operatorRef, operatorName: plan.operatorName },
  }
}

function internalPlanCategory(plan: NormalizedPlan): string {
  const tags = (plan.tags ?? []).map((t) => t.toUpperCase())
  if (tags.includes('DATA')) return 'data'
  if (tags.includes('AIRTIME')) return 'airtime'
  if (tags.includes('VOICE') || tags.includes('SMS')) return 'combo'
  return 'topup'
}

async function createOrGetInternalPlan(plan: NormalizedPlan) {
  const fp = fingerprintPlan(plan)
  const existing = await dbFindInternalPlanByHash(fp.normalizedHash)
  if (existing?.id) return { plan: existing, created: false }
  const created = await dbCreateInternalPlan({
    countryIso3: plan.countryIso3,
    operatorRef: plan.operatorRef,
    service: plan.service,
    subservice: plan.subservice,
    category: internalPlanCategory(plan),
    utiPlanName: plan.name || fp.canonicalSignature,
    utiDescription: plan.description,
    normalizedHash: fp.normalizedHash,
    canonicalSignature: fp.canonicalSignature,
    confidence: 'exact',
    rawResponse: plan.raw,
  })
  return { plan: created, created: Boolean(created?.id) }
}

export async function syncAggregatorProvider(
  providerId: string,
  options?: SyncCatalogOptions,
): Promise<AggregatorSyncResult> {
  const started = Date.now()
  const providerRow = await aggGetProvider(providerId)
  if (!providerRow) throw new Error('provider_not_found')
  const config: ProviderConfig = rowToProviderConfig(providerRow as any)
  const syncedCountries = resolveSyncCountries(config, options)
  if (!config.isActive) {
    return {
      providerId,
      providerCode: config.code,
      fetchedRaw: 0,
      rawOperators: 0,
      normalized: 0,
      systemOperators: 0,
      systemPlans: 0,
      mappedPlans: 0,
      duplicateSuggestions: 0,
      skippedOperators: 0,
      durationMs: Date.now() - started,
      syncedCountries,
    }
  }

  const syncStartedAt = new Date().toISOString()
  await aggInsertSyncLog({
    serviceProviderId: providerId,
    syncType: 'provider',
    stage: 'full-sync',
    status: 'RUNNING',
    startedAt: syncStartedAt,
    metadata: { providerCode: config.code, syncedCountries },
  }).catch(() => {})

  try {
    const diag = createSyncDiagnostics(providerId, config.code)
    const dynamicMode = await canUseDynamicClassification().catch(() => false)
    const connector = getConnector(config.adapterKey)
    const raw = await connector.fetchRawPlans(config, { countries: syncedCountries.length ? syncedCountries : undefined })
    diag.stages.ding_api_fetch.recordsReceived = raw.length
    diag.stages.ding_api_fetch.recordsStored = raw.length

    const normalized = await connector.normalizePlans({ config, raw })
    diag.stages.normalization.recordsReceived = raw.length
    diag.stages.normalization.recordsStored = normalized.length
    diag.stages.normalization.recordsFiltered = raw.length - normalized.length

    for (const plan of normalized) {
      const rawCountry = (plan.raw as { CountryIso?: string; CountryIso3?: string }) ?? {}
      const providerCountry = String(rawCountry.CountryIso ?? rawCountry.CountryIso3 ?? plan.countryIso3 ?? '')
      const resolvedIso3 = normalizeCountryIso3(providerCountry || plan.countryIso3)
      if (diag.countryMappings.length < 20) {
        logCountryMapping(diag, providerCountry, resolvedIso3)
      }
    }

    let rawOperators = 0
    let systemOperators = 0
    let systemPlans = 0
    let mappedPlans = 0
    let duplicateSuggestions = 0
    let createdInternalPlans = 0
    let skippedOperators = 0
    let operatorMappings = 0
    const syncWarnings: string[] = []
    const mappedSystemOperatorIds = new Set<string>()

    diag.stages.operator_classification.recordsReceived = normalized.length

    // Group normalized plans by providerOperatorId
    const plansByOperatorId = new Map<string, { op: ReturnType<typeof rawOperatorFromPlan>; plans: NormalizedPlan[] }>()
    for (const plan of normalized) {
      const op = rawOperatorFromPlan(plan)
      if (!op.providerOperatorId) continue
      if (!plansByOperatorId.has(op.providerOperatorId)) {
        plansByOperatorId.set(op.providerOperatorId, { op, plans: [] })
      }
      plansByOperatorId.get(op.providerOperatorId)!.plans.push(plan)
    }

    // Pre-classify operators and cache results
    const operatorClassification = new Map<string, ReturnType<typeof classifyOperatorByPlans>>()
    for (const [operatorId, data] of plansByOperatorId.entries()) {
      const classification = classifyOperatorByPlans(data.op.providerOperatorName, data.plans)
      operatorClassification.set(operatorId, classification)
    }

    const auditedOperatorIds = new Set<string>()

    for (const plan of normalized) {
      const op = rawOperatorFromPlan(plan)
      if (!op.providerOperatorId || !op.providerOperatorName) continue

      const opClass = operatorClassification.get(op.providerOperatorId) || {
        isValid: false,
        reason: 'NO_VALID_PLANS',
        score: 0,
      }

      let systemOperatorInput = null
      let telecomOperatorName: string | null = null
      let rawOperatorType = 'UNKNOWN'
      let staticClassification: any = null
      let dynamicClassification: any = null

      if (opClass.isValid) {
        staticClassification = classifyProviderOperatorRecord({
          providerOperatorName: op.providerOperatorName,
          providerOperatorId: op.providerOperatorId,
          productName: plan.name ?? null,
          serviceType: plan.service ?? null,
          category: internalPlanCategory(plan),
          operatorType: op.operatorType,
          countryIso3: op.countryCode,
          plan,
          rawResponseJson: op.rawResponseJson,
        })

        dynamicClassification = dynamicMode
          ? await classifyTelecomRecordDynamic({
              providerOperatorName: op.providerOperatorName,
              planName: plan.name ?? null,
              serviceType: plan.service ?? null,
              category: internalPlanCategory(plan),
              tags: plan.tags ?? [],
              benefits: plan.benefits,
              metadata: op.rawResponseJson,
            }).catch(() => null)
          : null

        const classification = dynamicClassification
          ? {
              kind: dynamicClassification.isTelecom ? 'MOBILE_OPERATOR' : 'UNKNOWN',
              isTelecomOperator: dynamicClassification.isTelecom,
              skipReason: dynamicClassification.isTelecom ? null : staticClassification.skipReason ?? 'NOT_TELECOM_OPERATOR',
            }
          : staticClassification

        if (classification.kind === 'MOBILE_OPERATOR' && classification.isTelecomOperator) {
          telecomOperatorName = op.providerOperatorName
        } else {
          const resolved = resolveTelecomOperatorName({
            plan,
            providerOperatorName: op.providerOperatorName,
            providerOperatorId: op.providerOperatorId,
            countryIso3: op.countryCode,
          })
          if (resolved && isGenuineTelecomOperatorName(resolved, op.countryCode)) {
            telecomOperatorName = resolved
          }
        }

        telecomOperatorName = telecomOperatorName || op.providerOperatorName
        rawOperatorType = 'TELECOM'
      } else {
        if (opClass.reason === 'GIFT_CARD_PROVIDER') {
          rawOperatorType = 'GIFT_CARD'
        } else if (opClass.reason === 'GAMING_PROVIDER') {
          rawOperatorType = 'GAMING'
        } else if (opClass.reason === 'SUBSCRIPTION_SERVICE') {
          rawOperatorType = 'SUBSCRIPTION'
        } else {
          rawOperatorType = 'UNKNOWN'
        }
      }

      const rawOperator = await aggUpsertRawOperator({
        serviceProviderId: providerId,
        providerOperatorId: op.providerOperatorId,
        providerOperatorName: op.providerOperatorName,
        countryCode: op.countryCode,
        isoCode: op.isoCode,
        mobileCountryCode: op.mobileCountryCode,
        logo: op.logo,
        operatorType: rawOperatorType,
        currency: op.currency,
        rawResponseJson: op.rawResponseJson,
        checksumHash: sha256(JSON.stringify(op.rawResponseJson)),
      })
      if (!rawOperator?.id) continue
      rawOperators += 1
      diag.uniqueRawOperatorIds.add(op.providerOperatorId)
      diag.stages.raw_operator_store.recordsStored = diag.uniqueRawOperatorIds.size

      if (!opClass.isValid) {
        if (!auditedOperatorIds.has(op.providerOperatorId)) {
          auditedOperatorIds.add(op.providerOperatorId)
          await aggUpsertFilteredOperator({
            providerId,
            rawOperatorId: rawOperator.id,
            rawOperatorName: op.providerOperatorName,
            filterReason: opClass.reason || 'LOW_TELECOM_CONFIDENCE',
            classificationScore: opClass.score,
          })
        }

        skippedOperators += 1
        diag.stages.operator_classification.recordsRejected += 1
        const warning = `Filtered non-telecom operator "${op.providerOperatorName}" (${op.countryCode}) - Reason: ${opClass.reason}`
        syncWarnings.push(warning)
        if (process.env.SYNC_VERBOSE === 'true') {
          console.warn(warning)
        }
        logOperatorDecision(diag, {
          providerOperatorId: op.providerOperatorId,
          providerOperatorName: op.providerOperatorName,
          countryIso3: op.countryCode,
          decision: 'REJECTED',
          reason: opClass.reason || 'LOW_TELECOM_CONFIDENCE',
        })
      } else {
        const confidence = operatorNameConfidenceScore(telecomOperatorName!, op.countryCode)
        logOperatorDecision(diag, {
          providerOperatorId: op.providerOperatorId,
          providerOperatorName: op.providerOperatorName,
          countryIso3: op.countryCode,
          decision: telecomOperatorName === op.providerOperatorName ? 'ACCEPTED' : 'RESOLVED',
          resolvedName: telecomOperatorName ?? undefined,
          confidence,
          reason:
            telecomOperatorName !== op.providerOperatorName
              ? 'RESOLVED_FROM_PROVIDER_METADATA'
              : undefined,
        })
        systemOperatorInput = buildSystemOperatorInput(plan, telecomOperatorName!)
      }

      let systemOperator: Awaited<ReturnType<typeof aggUpsertSystemOperator>> | null = null
      let aggregateOperator: Awaited<ReturnType<typeof aggUpsertAggregateOperator>> | null = null
      if (systemOperatorInput) {
        if (dynamicMode) {
          const norm = await normalizeOperatorNameDynamic({
            operatorName: telecomOperatorName ?? op.providerOperatorName,
            countryIso3: op.countryCode,
          })
          const match = scoreAggregateOperatorCandidate({
            normalizedName: norm.normalizedName,
            countryIso3: op.countryCode,
            aliasName: op.providerOperatorName,
            classificationConfidence: dynamicClassification?.confidence ?? 75,
          })
          aggregateOperator = await aggUpsertAggregateOperator({
            normalizedName: norm.normalizedName,
            displayName: norm.displayName,
            countryId: op.countryCode,
            operatorClass: dynamicClassification?.category ?? 'MOBILE_OPERATOR',
            confidenceScore: match.score,
            duplicateConfidence: match.confidence,
            metadata: {
              provider_code: config.code,
              dynamic_reasons: dynamicClassification?.reasons ?? [],
            },
          })

          if (aggregateOperator?.id) {
            await aggUpsertAggregateOperatorMapping({
              providerId,
              providerOperatorRawId: rawOperator.id,
              aggregateOperatorId: aggregateOperator.id,
              matchScore: match.score,
              matchConfidence: match.confidence,
              matchReason: 'Dynamic telecom normalization',
            })
            await aggUpsertOperatorAlias({
              aggregateOperatorId: aggregateOperator.id,
              aliasName: op.providerOperatorName,
              providerId,
              providerOperatorRawId: rawOperator.id,
              confidenceScore: match.score,
            })
          }
        }

        systemOperator = await aggUpsertSystemOperator(systemOperatorInput)
        if (systemOperator?.id) {
          systemOperators += 1
          diag.stages.system_operator_create.recordsStored = systemOperators
          const mapping = await aggUpsertOperatorMapping({
            serviceProviderId: providerId,
            providerOperatorRawId: rawOperator.id,
            systemOperatorId: systemOperator.id,
            mappingConfidence: telecomOperatorName === op.providerOperatorName ? 92 : 78,
            mappingType: 'AUTO',
            isVerified: false,
          })
          if (mapping?.id) {
            operatorMappings += 1
            mappedSystemOperatorIds.add(systemOperator.id)
            diag.stages.operator_mapping.recordsMapped = mappedSystemOperatorIds.size
          }
          if (dynamicMode && aggregateOperator?.id) {
            await aggUpsertSystemOperatorLineage({
              aggregateOperatorId: aggregateOperator.id,
              systemOperatorId: systemOperator.id,
              confidenceScore: dynamicClassification?.confidence ?? 80,
              reason: 'Dynamic aggregate -> system linkage',
            }).catch(() => {})
          }
          await aggInsertTransformAudit({
            providerId,
            stage: 'SYSTEM',
            sourceTable: 'provider_operator_raw',
            sourceId: rawOperator.id,
            targetTable: 'system_operators',
            targetId: systemOperator.id,
            action: 'UPSERT',
            reason: dynamicClassification?.reasons?.[0] ?? 'classification',
            confidenceScore: dynamicClassification?.confidence ?? 80,
            details: {
              provider_operator_name: op.providerOperatorName,
              resolved_operator_name: telecomOperatorName,
              country: op.countryCode,
              dynamic_mode: dynamicMode,
            },
          })
        }
      }

      const planForInternal: NormalizedPlan = systemOperator?.id
        ? {
            ...plan,
            operatorRef: `system:${systemOperator.id}`,
            operatorName: systemOperator.system_operator_name,
          }
        : plan

      const internal = await createOrGetInternalPlan(planForInternal)
      if (!internal.plan?.id) continue
      if (internal.created) createdInternalPlans += 1

      const parts = extractPlanSignatureParts(plan)
      const rawPlan = await aggUpsertRawPlan({
        providerId,
        providerPlanId: plan.providerPlanId,
        providerOperatorRawId: rawOperator.id,
        providerPlanName: plan.name ?? null,
        providerPlanCode: plan.providerPlanId,
        amount: plan.retailAmount ?? plan.destinationAmount ?? null,
        currency: plan.retailCurrency ?? null,
        validity: plan.validityDays ? `${plan.validityDays}D` : null,
        talktime: parts.talktime || null,
        dataVolume: parts.data || null,
        sms: parts.sms || null,
        description: plan.description ?? null,
        planType: plan.planType ?? null,
        benefitsJson: plan.benefits,
        rawJson: plan.raw,
        checksumHash: sha256(JSON.stringify(plan.raw)),
        status: 'active',
      })
      if (!rawPlan?.id) continue

      if (systemOperator?.id) {
        const candidates = await aggFindSystemPlanCandidates({
          systemOperatorId: systemOperator.id,
          amount: plan.retailAmount ?? plan.destinationAmount ?? null,
          currency: plan.retailCurrency ?? null,
        })
        const duplicateCandidates = candidates
          .map((candidate) => scorePlanCandidate(plan, candidate))
          .filter(Boolean) as Array<ReturnType<typeof scorePlanCandidate> & { systemPlanId: string }>

        const systemPlan = await aggUpsertSystemPlan(
          buildSystemPlanInput({
            plan,
            systemOperatorId: systemOperator.id,
            internalPlanId: internal.plan.id,
          }),
        )
        if (systemPlan?.id) {
          systemPlans += 1

          await aggUpsertPlanMapping({
            serviceProviderId: providerId,
            providerPlanRawId: rawPlan.id,
            systemPlanId: systemPlan.id,
            matchingScore: 95,
            matchingReason: 'Automatic normalized signature match',
            isVerified: false,
          })
          mappedPlans += 1

          for (const candidate of duplicateCandidates) {
            if (!candidate || candidate.systemPlanId === systemPlan.id) continue
            await aggUpsertDuplicateSuggestion({
              serviceProviderId: providerId,
              providerPlanRawId: rawPlan.id,
              suggestedSystemPlanId: candidate.systemPlanId,
              matchScore: candidate.score,
              matchReason: candidate.reason,
              benefitsComparison: candidate.comparison,
            })
            duplicateSuggestions += 1
          }
        }
      }

      await dbUpsertInternalPlanMapping({
        internalPlanId: internal.plan.id,
        providerId,
        providerPlanId: plan.providerPlanId,
        providerPrice: plan.retailAmount,
        providerCurrency: plan.retailCurrency,
        providerPriority: config.priority,
        margin: 0,
        enabled: true,
      })
    }

    diag.stages.plan_mapping.recordsMapped = mappedPlans
    printPipelineReport(diag)

    // Cleanup operators without plans
    try {
      await aggCleanupSystemOperatorsWithoutPlans()
    } catch (cleanupErr) {
      console.error('Failed to cleanup operators without plans:', cleanupErr)
    }

    const durationMs = Date.now() - started
    const result: AggregatorSyncResult = {
      providerId,
      providerCode: config.code,
      fetchedRaw: raw.length,
      rawOperators,
      normalized: normalized.length,
      systemOperators,
      systemPlans,
      mappedPlans,
      duplicateSuggestions,
      skippedOperators,
      operatorMappings,
      durationMs,
      syncedCountries,
      warnings: syncWarnings.length ? syncWarnings.slice(0, 100) : undefined,
      diagnostics: summarizeDiagnostics(diag),
    }

    await Promise.all([
      aggPatchProvider(providerId, {
        last_sync_at: new Date().toISOString(),
        last_success_sync_at: new Date().toISOString(),
        status: 'online',
      }).catch(() => {}),
      aggInsertSyncLog({
        serviceProviderId: providerId,
        syncType: 'provider',
        stage: 'full-sync',
        status: 'SUCCESS',
        startedAt: syncStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs,
        fetchedCount: raw.length,
        normalizedCount: normalized.length,
        createdCount: createdInternalPlans,
        mappedCount: mappedPlans,
        duplicateCount: duplicateSuggestions,
        metadata: result,
      }).catch(() => {}),
      cacheDelByPrefix('catalog:').catch(() => 0),
      cacheDelByPrefix('aggregator:').catch(() => 0),
    ])

    return result
  } catch (error) {
    const durationMs = Date.now() - started
    await Promise.all([
      aggPatchProvider(providerId, {
        last_sync_at: new Date().toISOString(),
        status: 'degraded',
      }).catch(() => {}),
      aggInsertSyncLog({
        serviceProviderId: providerId,
        syncType: 'provider',
        stage: 'full-sync',
        status: 'FAILED',
        startedAt: syncStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs,
        errorMessage: error instanceof Error ? error.message : 'sync_failed',
      }).catch(() => {}),
    ])
    throw error
  }
}
