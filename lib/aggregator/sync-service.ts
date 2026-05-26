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
} from '@/lib/aggregator/repository'

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
    const connector = getConnector(config.adapterKey)
    const raw = await connector.fetchRawPlans(config, { countries: syncedCountries.length ? syncedCountries : undefined })
    const normalized = await connector.normalizePlans({ config, raw })

    let rawOperators = 0
    let systemOperators = 0
    let systemPlans = 0
    let mappedPlans = 0
    let duplicateSuggestions = 0
    let createdInternalPlans = 0

    for (const plan of normalized) {
      const op = rawOperatorFromPlan(plan)
      if (!op.providerOperatorId || !op.providerOperatorName) continue

      const rawOperator = await aggUpsertRawOperator({
        serviceProviderId: providerId,
        providerOperatorId: op.providerOperatorId,
        providerOperatorName: op.providerOperatorName,
        countryCode: op.countryCode,
        isoCode: op.isoCode,
        mobileCountryCode: op.mobileCountryCode,
        logo: op.logo,
        operatorType: op.operatorType,
        currency: op.currency,
        rawResponseJson: op.rawResponseJson,
        checksumHash: sha256(JSON.stringify(op.rawResponseJson)),
      })
      if (!rawOperator?.id) continue
      rawOperators += 1

      const systemOperator = await aggUpsertSystemOperator(buildSystemOperatorInput(plan))
      if (!systemOperator?.id) continue
      systemOperators += 1

      await aggUpsertOperatorMapping({
        serviceProviderId: providerId,
        providerOperatorRawId: rawOperator.id,
        systemOperatorId: systemOperator.id,
        mappingConfidence: 92,
        mappingType: 'AUTO',
        isVerified: false,
      })

      const systemPlanCompatible: NormalizedPlan = {
        ...plan,
        operatorRef: `system:${systemOperator.id}`,
        operatorName: systemOperator.system_operator_name,
      }
      const internal = await createOrGetInternalPlan(systemPlanCompatible)
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
      if (!systemPlan?.id) continue
      systemPlans += 1

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
      durationMs,
      syncedCountries,
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
