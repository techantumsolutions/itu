import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggInsertOperatorDomainAudit } from '@/lib/aggregator/repository'
import { normalizeOperatorForRegistry } from '@/lib/aggregator/catalog-intelligence/brand-intelligence'
import { createOperatorMergeHistoryMatcher } from '@/lib/aggregator/operator-merge-history'

function namesEquivalent(a: string, b: string): boolean {
  return normalizeOperatorForRegistry(a) === normalizeOperatorForRegistry(b)
}

export async function runStep4ApplyMergeHistory(
  providerId: string,
  config: any,
  syncRunId?: string | null,
): Promise<{ success: boolean; message: string; data?: any }> {
  const matcher = await createOperatorMergeHistoryMatcher()

  const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}&status=eq.active`, {
    cache: 'no-store',
  })
  const aggOps = (await opsRes.json().catch(() => [])) as any[]

  let appliedCount = 0
  let renamedCount = 0
  let mergedCount = 0
  let skippedCount = 0

  const deactivatedIds = new Set<string>()

  for (const op of aggOps) {
    if (deactivatedIds.has(String(op.id))) continue

    const operatorName = String(op.operator_name || op.name || '').trim()
    const countryIso3 = String(op.country_iso3 ?? '').toUpperCase()
    if (!operatorName || !countryIso3) {
      skippedCount++
      continue
    }

    const historyMatch = matcher.match(operatorName, countryIso3)
    if (!historyMatch) {
      skippedCount++
      continue
    }

    const targetName = historyMatch.row.targetOperatorName
    if (namesEquivalent(operatorName, targetName)) {
      skippedCount++
      continue
    }

    const canonical = aggOps.find(
      (candidate) =>
        candidate.id !== op.id &&
        String(candidate.country_iso3 ?? '').toUpperCase() === countryIso3 &&
        namesEquivalent(String(candidate.name || candidate.operator_name || ''), targetName),
    )

    if (canonical) {
      await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          operator_id: canonical.id,
          status: canonical.status || op.status || 'active',
        }),
      }).catch(() => {})

      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'inactive',
          name: `${operatorName} (merged into ${canonical.name || targetName})`,
        }),
      }).catch(() => {})

      deactivatedIds.add(String(op.id))
      mergedCount++
    } else {
      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: targetName }),
      }).catch(() => {})
      op.name = targetName
      renamedCount++
    }

    appliedCount++
    await aggInsertOperatorDomainAudit({
      operatorId: String(op.id),
      operatorName,
      countryIso3,
      providerCode: config.code,
      syncRunId,
      detectedDomain: 'MERGE_HISTORY',
      confidence: Math.round(historyMatch.similarity * 100),
      classificationSource: 'operator_merge_history',
      matchedRules: [`merge_history_${historyMatch.matchMethod}`],
      matchedKeywords: [historyMatch.matchedValue, targetName],
      rejectionReason: 'previous admin merge',
      registryMatch: false,
      matchMethod: historyMatch.matchMethod,
      telecomScore: null,
      decision: 'ACTIVE',
      domainBreakdown: {
        history_match: true,
        target_operator: targetName,
        match_method: historyMatch.matchMethod,
        reason: historyMatch.row.mergeReason,
        merged_by_admin: historyMatch.row.mergedByAdmin,
        canonical_operator_id: canonical?.id ?? null,
        action: canonical ? 'merged_into_existing' : 'renamed_to_target',
      },
    }).catch(() => {})
  }

  return {
    success: true,
    message: `Step 4b complete. Applied ${appliedCount} merge-history rules (${mergedCount} merged, ${renamedCount} renamed).`,
    data: {
      evaluated: aggOps.length,
      applied: appliedCount,
      merged: mergedCount,
      renamed: renamedCount,
      skipped: skippedCount,
    },
  }
}
