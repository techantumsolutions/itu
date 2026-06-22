import {
  aggGetProvider,
  aggStartSyncRun,
  aggUpdateSyncRun,
  aggInsertSyncLog,
  aggPatchProvider,
  isAggregatorSchemaReady,
} from '@/lib/aggregator/repository'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'
import { cacheDelByPrefix } from '@/lib/cache/redis'
import type { AggregatorSyncResult } from '@/lib/aggregator/types'
import { resolveSyncCountries, type SyncCatalogOptions } from '@/lib/lcr/sync-options'
import { validateCountriesTable } from '@/lib/aggregator/country-startup-validation'
import { loadCountryRegistry } from '@/lib/aggregator/country-registry'
import { runStep1Check } from './stages/step1-check'
import { runStep2Fetch } from './stages/step2-fetch'
import { runStep3Countries } from './stages/step3-countries'
import { runStep4Normalize } from './stages/step4-normalize'
import { runStep4ApplyMergeHistory } from './stages/step4-apply-merge-history'
import { runStep5FilterTelecom } from './stages/step5-filter-telecom'
import { runStep6Merge } from './stages/step6-merge'
import { runStep7Promote } from './stages/step7-promote'
import { runStep7MergeDuplicates } from './stages/step7-merge-duplicates'
import { runStep8FilterBenefits } from './stages/step8-filter-benefits'
import { calculateSyncVerificationDashboard } from './sync-verification'

export type PipelineStage =
  | 'step1_check'
  | 'step2_fetch'
  | 'step3_countries'
  | 'step4_normalize'
  | 'step4_apply_merge_history'
  | 'step5_filter_telecom'
  | 'step6_merge'
  | 'step7_promote'
  | 'step7_merge_duplicates'
  | 'step8_filter_benefits'

export async function runPipelineStage(
  stageKey: string,
  providerId: string,
  syncRunId?: string | null,
  options?: SyncCatalogOptions
): Promise<{ success: boolean; message: string; data?: any }> {
  const providerRow = await aggGetProvider(providerId)
  if (!providerRow) {
    throw new Error('Provider not found')
  }
  const config = rowToProviderConfig(providerRow as any)

  switch (stageKey) {
    case 'step1_check':
      return runStep1Check(providerId, config, syncRunId)
    case 'step2_fetch':
      return runStep2Fetch(providerId, config, syncRunId, options)
    case 'step3_countries':
      return runStep3Countries(providerId, config, syncRunId)
    case 'step4_normalize':
      return runStep4Normalize(providerId, config, syncRunId)
    case 'step4_apply_merge_history':
      return runStep4ApplyMergeHistory(providerId, config, syncRunId)
    case 'step5_filter_telecom':
      return runStep5FilterTelecom(providerId, config, syncRunId)
    case 'step6_merge':
      return runStep6Merge(providerId, config, syncRunId)
    case 'step7_promote':
      return runStep7Promote(providerId, config, syncRunId)
    case 'step7_merge_duplicates':
      return runStep7MergeDuplicates(providerId, config, syncRunId)
    case 'step8_filter_benefits':
      return runStep8FilterBenefits(providerId, config, syncRunId)
    default:
      throw new Error(`Invalid stage: ${stageKey}`)
  }
}

export async function runFullSyncPipeline(providerId: string, options?: SyncCatalogOptions): Promise<AggregatorSyncResult> {
  const fullSyncStartedAt = new Date().toISOString()

  if (!(await isAggregatorSchemaReady())) {
    throw new Error('Aggregator staging schema not initialized')
  }

  const providerRow = await aggGetProvider(providerId)
  if (!providerRow) {
    throw new Error('Provider not found')
  }
  const config = rowToProviderConfig(providerRow as any)

  const syncRunId = await aggStartSyncRun(config.code)

  await validateCountriesTable()
  await loadCountryRegistry()

  await aggInsertSyncLog({
    serviceProviderId: providerId,
    syncType: 'provider',
    stage: 'full-sync',
    status: 'RUNNING',
    startedAt: fullSyncStartedAt,
    metadata: { providerCode: config.code, syncRunId },
  }).catch(() => {})

  const stages: PipelineStage[] = [
    'step1_check',
    'step2_fetch',
    'step3_countries',
    'step4_normalize',
    'step4_apply_merge_history',
    'step5_filter_telecom',
    'step6_merge',
    'step7_promote',
    'step7_merge_duplicates',
    'step8_filter_benefits',
  ]

  const stageResults: Record<string, any> = {}

  const runStage = async (stageKey: PipelineStage) => {
    const startedAt = new Date().toISOString()
    await aggInsertSyncLog({
      serviceProviderId: providerId,
      syncType: 'provider',
      stage: stageKey,
      status: 'RUNNING',
      startedAt,
      metadata: { syncRunId },
    }).catch(() => {})

    try {
      const result = await runPipelineStage(stageKey, providerId, syncRunId, options)
      if (!result.success) {
        throw new Error(result.message || `Stage ${stageKey} failed`)
      }
      const finishedAt = new Date().toISOString()
      const durationMs = Date.now() - new Date(startedAt).getTime()

      await aggInsertSyncLog({
        serviceProviderId: providerId,
        syncType: 'provider',
        stage: stageKey,
        status: 'SUCCESS',
        startedAt,
        finishedAt,
        durationMs,
        fetchedCount: result.data?.fetchedRaw || 0,
        normalizedCount: result.data?.normalized || result.data?.operatorsNormalized || result.data?.active || 0,
        createdCount: result.data?.rawPlans || result.data?.plansNormalized || result.data?.promotedPlans || 0,
        mappedCount: result.data?.promotedOps || 0,
        duplicateCount: result.data?.mergedCount || result.data?.quarantined || 0,
        metadata: { ...result.data, syncRunId },
      }).catch(() => {})

      return result
    } catch (error: any) {
      const finishedAt = new Date().toISOString()
      const durationMs = Date.now() - new Date(startedAt).getTime()
      await aggInsertSyncLog({
        serviceProviderId: providerId,
        syncType: 'provider',
        stage: stageKey,
        status: 'FAILED',
        startedAt,
        finishedAt,
        durationMs,
        errorMessage: error.message || String(error),
        metadata: { syncRunId },
      }).catch(() => {})
      throw error
    }
  }

  try {
    for (const stage of stages) {
      stageResults[stage] = await runStage(stage)
    }

    const durationMs = Date.now() - new Date(fullSyncStartedAt).getTime()

    const step2Data = stageResults['step2_fetch']?.data ?? {}
    const step3Data = stageResults['step3_countries']?.data ?? {}
    const step4Data = stageResults['step4_normalize']?.data ?? {}
    const step5Data = stageResults['step5_filter_telecom']?.data ?? {}
    const step7Data = stageResults['step7_promote']?.data ?? {}
    const step75Data = stageResults['step7_merge_duplicates']?.data ?? {}
    const step8Data = stageResults['step8_filter_benefits']?.data ?? {}

    const verificationDashboard = await calculateSyncVerificationDashboard({
      duplicatePlansMerged: Number(step75Data.mergedPlans ?? step75Data.mergedCount ?? 0),
    }).catch((err) => {
      console.warn('[Sync] verification dashboard failed:', err)
      return null
    })

    const finalResult: AggregatorSyncResult = {
      providerId,
      providerCode: config.code,
      fetchedRaw: step2Data.fetchedRaw || 0,
      rawOperators: step2Data.rawOperators || 0,
      normalized: step3Data.plansNormalized || step3Data.normalized || 0,
      systemOperators: step7Data.promotedOps || 0,
      systemPlans: step7Data.promotedPlans || 0,
      mappedPlans: step7Data.promotedPlans || 0,
      duplicateSuggestions: step8Data.quarantined || 0,
      skippedOperators: step4Data.inactive || 0,
      durationMs,
      syncedCountries: resolveSyncCountries(config, options) || [],
      verificationDashboard: verificationDashboard ?? undefined,
    }

    if (syncRunId) {
      await aggUpdateSyncRun(syncRunId, {
        status: 'success',
        finished_at: new Date().toISOString(),
        operators_fetched: finalResult.rawOperators,
        operators_accepted: finalResult.systemOperators,
        operators_rejected: finalResult.skippedOperators,
        plans_fetched: finalResult.normalized,
        plans_accepted: finalResult.systemPlans,
        plans_rejected: finalResult.normalized - finalResult.systemPlans,
        error_message:
          step7Data.syncHealth?.status === 'WARNING'
            ? `Mapping health warning: ${step7Data.syncHealth.healthySystemPlans}/${step7Data.syncHealth.activeSystemPlans} active plans have live raw links`
            : null,
      }).catch(() => {})
    }

    if (verificationDashboard) {
      await aggInsertSyncLog({
        serviceProviderId: providerId,
        syncType: 'provider',
        stage: 'sync_verification',
        status: 'SUCCESS',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        duplicateCount: verificationDashboard.duplicatePlansMerged,
        metadata: { verificationDashboard, syncRunId },
      }).catch(() => {})
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
        startedAt: fullSyncStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs,
        fetchedCount: finalResult.fetchedRaw,
        normalizedCount: finalResult.normalized,
        createdCount: finalResult.systemPlans,
        mappedCount: finalResult.systemOperators,
        duplicateCount: finalResult.duplicateSuggestions,
        metadata: {
          ...finalResult,
          verificationDashboard,
          duplicatePlansMerged: step75Data.mergedPlans ?? step75Data.mergedCount ?? 0,
        },
      }).catch(() => {}),
      cacheDelByPrefix('catalog:').catch(() => 0),
      cacheDelByPrefix('aggregator:').catch(() => 0),
    ])

    return finalResult
  } catch (error: any) {
    const durationMs = Date.now() - new Date(fullSyncStartedAt).getTime()

    if (syncRunId) {
      await aggUpdateSyncRun(syncRunId, {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: error.message || String(error),
      }).catch(() => {})
    }

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
        startedAt: fullSyncStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs,
        errorMessage: error.message || String(error),
        metadata: { syncRunId },
      }).catch(() => {}),
    ])

    throw error
  }
}
