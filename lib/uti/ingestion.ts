import crypto from 'crypto'
import type { ProviderConfig, NormalizedPlan } from '@/lib/providers/types'
import { getConnector } from '@/lib/providers/registry'
import { fingerprintPlan } from '@/lib/uti/normalize'
import type { SyncCatalogOptions } from '@/lib/lcr/sync-options'
import { resolveSyncCountries } from '@/lib/lcr/sync-options'
import { wholesaleCostFromNormalizedPlan } from '@/lib/catalog/provider-wholesale-pricing'
import {
  dbCreateInternalPlan,
  dbEnqueuePlanReview,
  dbFindInternalPlanByHash,
  dbUpsertInternalPlanMapping,
  dbUpsertProviderRawPlan,
  dbPatchProvider,
} from '@/lib/uti/repository'

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export type IngestResult = {
  providerId: string
  providerCode: string
  fetchedRaw: number
  normalized: number
  createdInternalPlans: number
  mappedPlans: number
  reviewQueued: number
  durationMs: number
  syncedCountries: string[]
}

function categoryFromPlan(p: NormalizedPlan): string {
  const tags = (p.tags ?? []).map((t) => t.toUpperCase())
  if (tags.includes('DATA')) return 'data'
  if (tags.includes('AIRTIME')) return 'airtime'
  if (tags.includes('VOICE') || tags.includes('SMS')) return 'combo'
  return 'topup'
}

export async function ingestProviderPlans(config: ProviderConfig, options?: SyncCatalogOptions): Promise<IngestResult> {
  const started = Date.now()
  const connector = getConnector(config.adapterKey)
  const syncedCountries = resolveSyncCountries(config, options)

  try {
    const raw = await connector.fetchRawPlans(config, { countries: syncedCountries.length ? syncedCountries : undefined })
    for (const r of raw) {
      const checksumHash = sha256(JSON.stringify(r.raw))
      await dbUpsertProviderRawPlan({
        providerId: config.id,
        providerPlanId: r.providerPlanId,
        rawJson: r.raw,
        checksumHash,
        status: 'active',
      })
    }

    const normalized = await connector.normalizePlans({ config, raw })

    let createdInternalPlans = 0
    let mappedPlans = 0
    let reviewQueued = 0

    for (const p of normalized) {
      const fp = fingerprintPlan(p)
      const existing = await dbFindInternalPlanByHash(fp.normalizedHash)
      const internal =
        existing ??
        (await dbCreateInternalPlan({
          countryIso3: p.countryIso3,
          operatorRef: p.operatorRef,
          service: p.service,
          subservice: p.subservice,
          category: categoryFromPlan(p),
          utiPlanName: p.name || fp.canonicalSignature, // admin can override later
          utiDescription: p.description,
          normalizedHash: fp.normalizedHash,
          canonicalSignature: fp.canonicalSignature,
          confidence: 'exact',
          rawResponse: p.raw,
        }))

      if (!existing && internal) createdInternalPlans += 1
      if (!internal?.id) continue

      const wholesale = wholesaleCostFromNormalizedPlan(p)

      // Map provider plan -> internal plan
      await dbUpsertInternalPlanMapping({
        internalPlanId: internal.id,
        providerId: config.id,
        providerPlanId: p.providerPlanId,
        providerPrice: wholesale.wholesaleAmount ?? 0,
        providerCurrency: wholesale.wholesaleCurrency ?? p.retailCurrency,
        providerPriority: config.priority,
        margin: 0,
        enabled: true,
      })
      mappedPlans += 1

      // If the connector couldn't produce strong fingerprints, we'd queue review.
      // For now, any missing critical fields -> review.
      const confidenceScore = p.countryIso3 && p.operatorRef && p.service ? 95 : 60
      if (confidenceScore < 70) {
        await dbEnqueuePlanReview({
          providerId: config.id,
          providerPlanId: p.providerPlanId,
          normalizedHash: fp.normalizedHash,
          confidenceScore,
          rawJson: p.raw,
        })
        reviewQueued += 1
      }
    }

    await dbPatchProvider(config.id, {
      last_sync_at: new Date().toISOString(),
      last_success_sync_at: new Date().toISOString(),
      status: 'online',
    }).catch((err) => console.error('Failed to update provider status on success', err))

    return {
      providerId: config.id,
      providerCode: config.code,
      fetchedRaw: raw.length,
      normalized: normalized.length,
      createdInternalPlans,
      mappedPlans,
      reviewQueued,
      durationMs: Date.now() - started,
      syncedCountries,
    }
  } catch (error) {
    await dbPatchProvider(config.id, {
      last_sync_at: new Date().toISOString(),
      status: 'degraded',
    }).catch((err) => console.error('Failed to update provider status on failure', err))
    throw error
  }
}

