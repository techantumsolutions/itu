import { normalizeOperatorForRegistry } from '@/lib/aggregator/catalog-intelligence/brand-intelligence'
import { buildStableOperatorMergeKey } from '@/lib/aggregator/merge-keys'
import { normalizeRegistryAlias } from '@/lib/aggregator/telecom-registry/normalize'
import type {
  MergeHistoryMatchMethod,
  OperatorMergeHistoryMatchResult,
  OperatorMergeHistoryRow,
} from './types'

const FUZZY_THRESHOLD = 0.9

function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0

  const bigrams = (input: string) => {
    const grams = new Map<string, number>()
    for (let i = 0; i < input.length - 1; i++) {
      const gram = input.slice(i, i + 2)
      grams.set(gram, (grams.get(gram) ?? 0) + 1)
    }
    return grams
  }

  const aGrams = bigrams(a)
  const bGrams = bigrams(b)
  let overlap = 0
  for (const [gram, count] of aGrams) {
    overlap += Math.min(count, bGrams.get(gram) ?? 0)
  }
  const total =
    [...aGrams.values()].reduce((sum, n) => sum + n, 0) +
    [...bGrams.values()].reduce((sum, n) => sum + n, 0)
  return total === 0 ? 0 : (2 * overlap) / total
}

function buildMatch(
  row: OperatorMergeHistoryRow,
  matchMethod: MergeHistoryMatchMethod,
  similarity: number,
  matchedValue: string,
): OperatorMergeHistoryMatchResult {
  return { row, matchMethod, similarity, matchedValue }
}

export class OperatorMergeHistoryMatcher {
  private readonly byCountry = new Map<string, OperatorMergeHistoryRow[]>()
  private readonly exactByCountry = new Map<string, Map<string, OperatorMergeHistoryRow>>()
  private readonly normalizedByCountry = new Map<string, Map<string, OperatorMergeHistoryRow>>()
  private readonly aliasByCountry = new Map<string, Map<string, OperatorMergeHistoryRow>>()

  constructor(rows: OperatorMergeHistoryRow[]) {
    for (const row of rows) {
      if (!row.isActive) continue
      const country = row.countryIso3.toUpperCase()
      if (!this.byCountry.has(country)) this.byCountry.set(country, [])
      this.byCountry.get(country)!.push(row)

      if (!this.exactByCountry.has(country)) this.exactByCountry.set(country, new Map())
      if (!this.normalizedByCountry.has(country)) this.normalizedByCountry.set(country, new Map())
      if (!this.aliasByCountry.has(country)) this.aliasByCountry.set(country, new Map())

      this.exactByCountry.get(country)!.set(row.sourceOperatorName.trim().toLowerCase(), row)
      this.normalizedByCountry.get(country)!.set(row.sourceOperatorNormalized, row)
      this.normalizedByCountry.get(country)!.set(row.sourceMergeKey, row)
      this.normalizedByCountry.get(country)!.set(buildStableOperatorMergeKey(row.sourceOperatorName), row)
      this.aliasByCountry.get(country)!.set(normalizeRegistryAlias(row.sourceOperatorName), row)
    }
  }

  match(operatorName: string, countryIso3: string): OperatorMergeHistoryMatchResult | null {
    const country = countryIso3.trim().toUpperCase()
    const normalizedCandidate = normalizeOperatorForRegistry(operatorName)
    const stableCandidate = buildStableOperatorMergeKey(operatorName)
    if (!country || (!normalizedCandidate && !stableCandidate)) return null

    const exactKey = operatorName.trim().toLowerCase()
    const exactHit = this.exactByCountry.get(country)?.get(exactKey)
    if (exactHit) return buildMatch(exactHit, 'exact', 1, exactKey)

    const stableHit = this.normalizedByCountry.get(country)?.get(stableCandidate)
    if (stableHit) return buildMatch(stableHit, 'normalized', 1, stableCandidate)

    const normalizedHit = normalizedCandidate
      ? this.normalizedByCountry.get(country)?.get(normalizedCandidate)
      : null
    if (normalizedHit) return buildMatch(normalizedHit, 'normalized', 1, normalizedCandidate)

    const aliasKey = normalizeRegistryAlias(operatorName)
    const aliasHit = this.aliasByCountry.get(country)?.get(aliasKey)
    if (aliasHit) return buildMatch(aliasHit, 'alias', 1, aliasKey)

    const countryRows = this.byCountry.get(country) ?? []
    let best: OperatorMergeHistoryMatchResult | null = null
    for (const row of countryRows) {
      const left = row.sourceOperatorNormalized.replace(/\s+/g, '')
      const right = normalizedCandidate.replace(/\s+/g, '')
      const score = diceSimilarity(left, right)
      if (score < FUZZY_THRESHOLD) continue
      const match = buildMatch(row, 'fuzzy', score, row.sourceOperatorName)
      if (!best || match.similarity > best.similarity) best = match
    }

    return best
  }
}
