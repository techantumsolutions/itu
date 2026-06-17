import { buildStableOperatorMergeKey } from '@/lib/aggregator/merge-keys'

export function buildOperatorMergeKey(operatorName: string): string {
  return buildStableOperatorMergeKey(operatorName)
}

export function buildPlanHistoryLookupKey(
  countryIso3: string,
  systemOperatorMergeKey: string,
  sourcePlanSignature: string,
): string {
  const country = countryIso3.trim().toUpperCase()
  const operatorKey = systemOperatorMergeKey.trim().toLowerCase()
  const signature = sourcePlanSignature.trim().toLowerCase()
  return `${country}:${operatorKey}:${signature}`
}

export function normalizePlanSignature(signature: string | null | undefined): string {
  return String(signature ?? '').trim()
}
