/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { OperatorTrustEngine } from '../catalog-intelligence/trust-engine'
import {
  resolveCountryIso3FromCountryId,
  upsertOperatorMergeHistory,
} from '../operator-merge-history'
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
import { enc } from './shared'
import type {
  PlanMappingRepairAction,
  PlanMappingRow,
  PlanMappingValidationStats,
} from './types'
import { aggAudit } from './writes'

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
    if (!nextRawId) {
      logStep7Promotion({
        ...logCtx,
        operation: 'SKIP',
        reason: 'missing_provider_plan_raw_id',
      })
      return { mapping: null, action: 'skipped' }
    }

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
