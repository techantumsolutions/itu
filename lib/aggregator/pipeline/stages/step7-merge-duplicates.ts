import {
  aggMergeDuplicateSystemPlansForProvider,
} from '@/lib/aggregator/repository'
import { applyPlanMergeHistoryForProvider } from '@/lib/aggregator/plan-merge-history'
import { applyOperatorMergeHistoryAtSystemLevel } from '@/lib/aggregator/operator-merge-history'

export async function runStep7MergeDuplicates(
  providerId: string,
  config: { code?: string },
  syncRunId?: string | null,
): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
  let mergedPlans = 0
  let historyMergedPlans = 0
  let historyMergedOperators = 0

  try {
    mergedPlans = await aggMergeDuplicateSystemPlansForProvider(providerId, 'system-sync')
  } catch (mergeErr) {
    console.error('[Step7.5] Failed to merge duplicate system plans:', mergeErr)
    return {
      success: false,
      message: mergeErr instanceof Error ? mergeErr.message : 'Duplicate plan merge failed',
    }
  }

  try {
    const operatorHistoryResult = await applyOperatorMergeHistoryAtSystemLevel(providerId, 'system-sync')
    historyMergedOperators = operatorHistoryResult.merged
  } catch (operatorHistoryErr) {
    console.error('[Step7.5] Failed to apply operator merge history:', operatorHistoryErr)
  }

  try {
    const historyResult = await applyPlanMergeHistoryForProvider(providerId, 'system-sync')
    historyMergedPlans = historyResult.merged
  } catch (historyErr) {
    console.error('[Step7.5] Failed to apply plan merge history:', historyErr)
  }

  return {
    success: true,
    message: `Step 7.5 complete. Merged ${mergedPlans} duplicate system plan(s). Reapplied ${historyMergedOperators} operator and ${historyMergedPlans} plan merge-history rules.`,
    data: {
      mergedCount: mergedPlans,
      mergedPlans,
      historyMergedOperators,
      historyMergedPlans,
      syncRunId,
      providerCode: config.code,
    },
  }
}
