import { hasMobileSubdomainBlocker } from '@/lib/aggregator/catalog-intelligence/brand-intelligence'
import { operatorNameForFiltration } from '@/lib/aggregator/pipeline/operator-country-strip'
import type { DomainOperatorRegistryRow, RegistryMatchMethod, RegistryMatchResult } from './types'
import { normalizeRegistryAlias, normalizeRegistryOperatorName } from './normalize'

const FUZZY_THRESHOLD = 0.9

function candidateNormalizedKeys(operatorName: string, countryIso3: string): string[] {
  const stripped = operatorNameForFiltration(operatorName, countryIso3)
  const normalized = normalizeRegistryOperatorName(stripped)
  const keys = new Set<string>()
  if (normalized) keys.add(normalized)
  const rawNormalized = normalizeRegistryOperatorName(operatorName)
  if (rawNormalized) keys.add(rawNormalized)
  return [...keys]
}

function normalizedContainsMatch(candidate: string, registryNormalized: string): boolean {
  if (!candidate || !registryNormalized) return false
  if (candidate === registryNormalized) return true
  const registryTokens = registryNormalized.split(' ').filter(Boolean)
  const candidateTokens = candidate.split(' ').filter(Boolean)
  if (candidateTokens.slice(-registryTokens.length).join(' ') === registryNormalized) return true
  return false
}

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
  const total = [...aGrams.values()].reduce((sum, n) => sum + n, 0) + [...bGrams.values()].reduce((sum, n) => sum + n, 0)
  return total === 0 ? 0 : (2 * overlap) / total
}

function buildMatch(
  row: DomainOperatorRegistryRow,
  matchMethod: RegistryMatchMethod,
  similarity: number,
  matchedValue: string,
): RegistryMatchResult {
  return {
    matched: true,
    row,
    matchMethod,
    similarity,
    matchedValue,
  }
}

export class TelecomOperatorRegistryMatcher {
  private readonly byCountry = new Map<string, DomainOperatorRegistryRow[]>()
  private readonly exactByCountry = new Map<string, Map<string, DomainOperatorRegistryRow>>()
  private readonly normalizedByCountry = new Map<string, Map<string, DomainOperatorRegistryRow>>()
  private readonly aliasByCountry = new Map<string, Map<string, DomainOperatorRegistryRow>>()

  constructor(rows: DomainOperatorRegistryRow[]) {
    for (const row of rows) {
      if (!row.isActive || String(row.domain).toUpperCase() !== 'MOBILE') continue
      const country = row.countryIso3.toUpperCase()
      if (!this.byCountry.has(country)) this.byCountry.set(country, [])
      this.byCountry.get(country)!.push(row)

      if (!this.exactByCountry.has(country)) this.exactByCountry.set(country, new Map())
      if (!this.normalizedByCountry.has(country)) this.normalizedByCountry.set(country, new Map())
      if (!this.aliasByCountry.has(country)) this.aliasByCountry.set(country, new Map())

      const exactKey = row.operatorName.trim().toLowerCase()
      const normalizedKey = row.normalizedName.trim().toUpperCase()
      this.exactByCountry.get(country)!.set(exactKey, row)
      this.normalizedByCountry.get(country)!.set(normalizedKey, row)

      for (const alias of row.aliases) {
        this.aliasByCountry.get(country)!.set(normalizeRegistryAlias(alias), row)
      }
      this.aliasByCountry.get(country)!.set(normalizeRegistryAlias(row.operatorName), row)
      this.aliasByCountry.get(country)!.set(normalizeRegistryAlias(row.normalizedName), row)
    }
  }

  match(operatorName: string, countryIso3: string): RegistryMatchResult | null {
    const country = countryIso3.trim().toUpperCase()
    const filtrationName = operatorNameForFiltration(operatorName, country)
    const normalizedCandidate = normalizeRegistryOperatorName(filtrationName)
    if (!country || !normalizedCandidate) return null
    if (hasMobileSubdomainBlocker(normalizedCandidate)) return null

    const exactKey = filtrationName.trim().toLowerCase()
    const exactHit = this.exactByCountry.get(country)?.get(exactKey)
    if (exactHit) return buildMatch(exactHit, 'exact', 1, exactKey)

    const normalizedHit = this.normalizedByCountry.get(country)?.get(normalizedCandidate)
    if (normalizedHit) return buildMatch(normalizedHit, 'normalized', 1, normalizedCandidate)

    for (const candidateKey of candidateNormalizedKeys(operatorName, country)) {
      const directHit = this.normalizedByCountry.get(country)?.get(candidateKey)
      if (directHit) return buildMatch(directHit, 'normalized', 1, candidateKey)
      for (const [registryNormalized, row] of this.normalizedByCountry.get(country) ?? []) {
        if (normalizedContainsMatch(candidateKey, registryNormalized)) {
          return buildMatch(row, 'normalized', 1, candidateKey)
        }
      }
    }

    const aliasSources = [filtrationName, operatorName]
      .map((value) => value.trim())
      .filter(Boolean)
    const seenAliasKeys = new Set<string>()
    for (const aliasSource of aliasSources) {
      const aliasKey = normalizeRegistryAlias(aliasSource)
      if (!aliasKey || seenAliasKeys.has(aliasKey)) continue
      seenAliasKeys.add(aliasKey)
      const aliasHit = this.aliasByCountry.get(country)?.get(aliasKey)
      if (aliasHit) return buildMatch(aliasHit, 'alias', 1, aliasKey)
    }

    const fuzzyTargets = [...seenAliasKeys]
    if (!fuzzyTargets.length) {
      fuzzyTargets.push(normalizeRegistryAlias(filtrationName))
    }
    const countryRows = this.byCountry.get(country) ?? []
    let best: RegistryMatchResult | null = null
    for (const row of countryRows) {
      const candidates = [
        row.operatorName,
        row.normalizedName,
        ...row.aliases,
      ]
      for (const candidate of candidates) {
        const left = normalizeRegistryAlias(candidate)
        for (const right of fuzzyTargets) {
          if (!right) continue
          const score = diceSimilarity(left.replace(/\s+/g, ''), right.replace(/\s+/g, ''))
          if (score < FUZZY_THRESHOLD) continue
          const match = buildMatch(row, 'fuzzy', score, candidate)
          if (!best || match.similarity > best.similarity) best = match
        }
      }
    }

    return best
  }
}

export function computeTelecomScore(input: {
  passed: boolean
  telecomRatio: number
  telecomPlanCount: number
}): number {
  if (input.passed) return Math.max(0.65, input.telecomRatio)
  if (input.telecomPlanCount > 0) return Math.min(0.64, input.telecomRatio)
  return 0
}

export function isWeakTelecomScore(score: number): boolean {
  return score < 0.35
}
