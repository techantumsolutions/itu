import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggInsertOperatorDomainAudit } from '@/lib/aggregator/repository'
import { buildStableOperatorMergeKey, mergeKeysEquivalent } from '@/lib/aggregator/merge-keys'
import { normalizeOperatorForRegistry } from '@/lib/aggregator/catalog-intelligence/brand-intelligence'
import { createOperatorMergeHistoryMatcher } from '@/lib/aggregator/operator-merge-history'

const PAGE_SIZE = 1000

function namesEquivalent(a: string, b: string): boolean {
  return (
    normalizeOperatorForRegistry(a) === normalizeOperatorForRegistry(b) ||
    mergeKeysEquivalent(buildStableOperatorMergeKey(a), buildStableOperatorMergeKey(b))
  )
}

async function fetchAllAggOperators(providerCode: string): Promise<any[]> {
  const rows: any[] = []
  let offset = 0

  while (true) {
    const res = await supabaseRest(
      `agg_operators?provider=eq.${encodeURIComponent(providerCode)}&status=eq.active&select=*&limit=${PAGE_SIZE}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const page = (await res.json()) as any[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

export async function runStep4ApplyMergeHistory(
  providerId: string,
  config: any,
  syncRunId?: string | null,
): Promise<{ success: boolean; message: string; data?: any }> {
  const matcher = await createOperatorMergeHistoryMatcher()
  const aggOps = await fetchAllAggOperators(config.code)

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

    if (historyMatch.row.countryIso3 !== countryIso3) {
      console.log(
        `[history][skip] Country mismatch source=${operatorName} historyCountry=${historyMatch.row.countryIso3} operatorCountry=${countryIso3}`,
      )
      skippedCount++
      continue
    }

    const targetName = historyMatch.row.targetOperatorName
    const targetMergeKey =
      historyMatch.row.targetMergeKey ||
      historyMatch.row.targetOperatorNormalized ||
      buildStableOperatorMergeKey(targetName)

    if (
      namesEquivalent(operatorName, targetName) ||
      mergeKeysEquivalent(buildStableOperatorMergeKey(operatorName), targetMergeKey)
    ) {
      skippedCount++
      continue
    }

    const canonical = aggOps.find(
      (candidate) =>
        candidate.id !== op.id &&
        !deactivatedIds.has(String(candidate.id)) &&
        String(candidate.country_iso3 ?? '').toUpperCase() === countryIso3 &&
        (namesEquivalent(String(candidate.name || candidate.operator_name || ''), targetName) ||
          mergeKeysEquivalent(
            buildStableOperatorMergeKey(String(candidate.name || candidate.operator_name || '')),
            targetMergeKey,
          )),
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

      console.log(
        `[history][operator] Applied merge history source=${operatorName} target=${targetName} country=${countryIso3} action=merged_into_existing`,
      )
    } else {
      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: targetName }),
      }).catch(() => {})
      op.name = targetName
      renamedCount++

      console.log(
        `[history][operator] Applied merge history source=${operatorName} target=${targetName} country=${countryIso3} action=renamed_only`,
      )
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
        target_merge_key: targetMergeKey,
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
