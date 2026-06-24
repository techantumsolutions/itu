import { supabaseRest } from '@/lib/db/supabase-rest'
import { dbUpsertInternalPlanMapping } from '@/lib/uti/repository'
import { resolveProvidersForSystemPlan } from '@/lib/recharge-orchestration/resolve-providers-for-system-plan'
import { authoritativePricingKey } from '@/lib/catalog/resolve-provider-pricing-for-system-plan'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type MirrorInternalCacheStats = {
  providerId?: string
  systemPlansScanned: number
  upserted: number
  disabled: number
  skipped: number
  errors: string[]
}

/**
 * One-way mirror: plan_mappings → internal_plan_provider_mapping (compatibility cache).
 * Never syncs internal → plan_mappings.
 */
export async function mirrorPlanMappingsToInternalCache(input?: {
  providerId?: string
  systemPlanId?: string
}): Promise<MirrorInternalCacheStats> {
  const stats: MirrorInternalCacheStats = {
    providerId: input?.providerId,
    systemPlansScanned: 0,
    upserted: 0,
    disabled: 0,
    skipped: 0,
    errors: [],
  }

  let systemPlanIds: string[] = []

  if (input?.systemPlanId) {
    systemPlanIds = [input.systemPlanId]
  } else {
    let query = 'plan_mappings?select=system_plan_id'
    if (input?.providerId) {
      query = `plan_mappings?service_provider_id=eq.${enc(input.providerId)}&select=system_plan_id`
    }
    const res = await supabaseRest(query, { cache: 'no-store' })
    if (!res.ok) {
      stats.errors.push(`Failed to list plan_mappings: ${await res.text()}`)
      return stats
    }
    const rows = (await res.json()) as Array<{ system_plan_id: string }>
    systemPlanIds = [...new Set(rows.map((r) => r.system_plan_id).filter(Boolean))]
  }

  stats.systemPlansScanned = systemPlanIds.length

  for (const systemPlanId of systemPlanIds) {
    try {
      const resolution = await resolveProvidersForSystemPlan(systemPlanId)
      if (!resolution?.internalPlanId) {
        stats.skipped++
        continue
      }

      const internalPlanId = resolution.internalPlanId
      const authoritativeKeys = new Set(
        resolution.providers.map((p) => authoritativePricingKey(p.providerId, p.providerPlanId)),
      )

      for (const provider of resolution.providers) {
        if (input?.providerId && provider.providerId !== input.providerId) continue
        if (
          provider.provider_wholesale_amount == null ||
          !provider.provider_wholesale_currency
        ) {
          stats.skipped++
          continue
        }

        await dbUpsertInternalPlanMapping({
          internalPlanId,
          providerId: provider.providerId,
          providerPlanId: provider.providerPlanId,
          providerPrice: provider.provider_wholesale_amount,
          providerCurrency: provider.provider_wholesale_currency,
          providerPriority: provider.provider_priority,
          margin: provider.margin,
          enabled: provider.availability,
        })
        stats.upserted++
      }

      const cacheRes = await supabaseRest(
        `internal_plan_provider_mapping?internal_plan_id=eq.${enc(internalPlanId)}&select=id,provider_id,provider_plan_id`,
        { cache: 'no-store' },
      )
      if (cacheRes.ok) {
        const cacheRows = (await cacheRes.json()) as Array<{
          id: string
          provider_id: string
          provider_plan_id: string
        }>
        for (const row of cacheRows) {
          const key = authoritativePricingKey(row.provider_id, row.provider_plan_id)
          if (authoritativeKeys.has(key)) continue
          await supabaseRest(`internal_plan_provider_mapping?id=eq.${enc(row.id)}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ enabled: false, last_verified_at: new Date().toISOString() }),
          }).catch((err) => {
            stats.errors.push(
              `Failed to disable orphan ${row.provider_id}:${row.provider_plan_id}: ${err}`,
            )
          })
          stats.disabled++
        }
      }
    } catch (err) {
      stats.errors.push(
        `system_plan_id=${systemPlanId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return stats
}
