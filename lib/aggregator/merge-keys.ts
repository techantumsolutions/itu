import { canonicalOperatorName } from '@/lib/aggregator/operator-normalizer'
import { normalizeOperatorForRegistry } from '@/lib/aggregator/catalog-intelligence/brand-intelligence'

/** Stable operator merge key — strips country/noise tokens so names match across sync runs. */
export function buildStableOperatorMergeKey(operatorName: string): string {
  const canonical = canonicalOperatorName(operatorName)
  if (canonical) return canonical
  return normalizeOperatorForRegistry(operatorName)
}

export function mergeKeysEquivalent(a: string, b: string): boolean {
  const left = String(a ?? '').trim().toUpperCase()
  const right = String(b ?? '').trim().toUpperCase()
  return Boolean(left && right && left === right)
}

export function normalizePlanNameForHistory(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}
