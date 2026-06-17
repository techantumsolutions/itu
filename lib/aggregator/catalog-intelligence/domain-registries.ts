import {
  detectExplicitServiceDomain,
  exactMobileBrandMatch,
  normalizeOperatorForRegistry,
} from './brand-intelligence'
import type { NonTelecomOperatorMatch, OperatorDomain, OperatorDomainRegistryMatch } from './types'

export { normalizeOperatorForRegistry } from './brand-intelligence'

const BUILTIN_NON_TELECOM: NonTelecomOperatorMatch[] = [
  { normalizedName: 'CAFE COFFEE DAY', operatorName: 'Cafe Coffee Day', operatorDomain: 'FOOD', confidence: 98 },
  { normalizedName: 'HYATT', operatorName: 'Hyatt', operatorDomain: 'TRAVEL', confidence: 98 },
  { normalizedName: 'ASSASSINS CREED', operatorName: "Assassin's Creed", operatorDomain: 'GAMING', confidence: 98 },
  { normalizedName: 'GODDESS OF VICTORY', operatorName: 'Goddess of Victory', operatorDomain: 'GAMING', confidence: 98 },
  { normalizedName: 'STEAM', operatorName: 'Steam', operatorDomain: 'GAMING', confidence: 98 },
  { normalizedName: 'NETFLIX', operatorName: 'Netflix', operatorDomain: 'OTT', confidence: 98 },
  { normalizedName: 'SPOTIFY', operatorName: 'Spotify', operatorDomain: 'OTT', confidence: 98 },
  { normalizedName: 'AMAZON', operatorName: 'Amazon', operatorDomain: 'RETAIL', confidence: 98 },
  { normalizedName: 'WALMART', operatorName: 'Walmart', operatorDomain: 'RETAIL', confidence: 98 },
  { normalizedName: 'UBER', operatorName: 'Uber', operatorDomain: 'TRAVEL', confidence: 95 },
  { normalizedName: 'CRUNCHYROLL', operatorName: 'Crunchyroll', operatorDomain: 'OTT', confidence: 98 },
  { normalizedName: 'DISNEY', operatorName: 'Disney', operatorDomain: 'OTT', confidence: 95 },
  { normalizedName: 'RAZER', operatorName: 'Razer', operatorDomain: 'GAMING', confidence: 95 },
  { normalizedName: 'XBOX', operatorName: 'Xbox', operatorDomain: 'GAMING', confidence: 98 },
  { normalizedName: 'PLAYSTATION', operatorName: 'PlayStation', operatorDomain: 'GAMING', confidence: 98 },
  { normalizedName: 'STARBUCKS', operatorName: 'Starbucks', operatorDomain: 'FOOD', confidence: 98 },
  { normalizedName: 'DOMINOS', operatorName: 'Dominos', operatorDomain: 'FOOD', confidence: 98 },
  { normalizedName: 'MCDONALDS', operatorName: 'McDonalds', operatorDomain: 'FOOD', confidence: 98 },
]

const BUILTIN_DOMAIN_REGISTRY: OperatorDomainRegistryMatch[] = [
  { normalizedName: 'JIO', operatorName: 'Jio', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'RELIANCE JIO', operatorName: 'Reliance Jio', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'JOI', operatorName: 'Joi', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'AIRTEL', operatorName: 'Airtel', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'VODAFONE', operatorName: 'Vodafone', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'VI', operatorName: 'Vi', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'IDEA', operatorName: 'Idea', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'BSNL', operatorName: 'BSNL', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'MTNL', operatorName: 'MTNL', operatorDomain: 'MOBILE', confidence: 99 },
  { normalizedName: 'MTN', operatorName: 'MTN', operatorDomain: 'MOBILE', confidence: 98 },
  { normalizedName: 'ORANGE', operatorName: 'Orange', operatorDomain: 'MOBILE', confidence: 98 },
  { normalizedName: 'CLARO', operatorName: 'Claro', operatorDomain: 'MOBILE', confidence: 98 },
  { normalizedName: 'GLOBE', operatorName: 'Globe', operatorDomain: 'MOBILE', confidence: 98 },
  { normalizedName: 'TELKOMSEL', operatorName: 'Telkomsel', operatorDomain: 'MOBILE', confidence: 98 },
  { normalizedName: 'SAFARICOM', operatorName: 'Safaricom', operatorDomain: 'MOBILE', confidence: 98 },
]

function exactRegistryMatch(candidate: string, entryNormalized: string): boolean {
  if (!candidate || !entryNormalized) return false
  if (candidate === entryNormalized) return true
  return exactMobileBrandMatch(candidate, entryNormalized)
}

export function matchNonTelecomOperator(
  operatorName: string,
  dbMatches: NonTelecomOperatorMatch[] = [],
): NonTelecomOperatorMatch | null {
  const explicit = detectExplicitServiceDomain(operatorName)
  if (explicit && explicit.domain !== 'MOBILE') {
    return {
      normalizedName: explicit.profile.normalized,
      operatorName,
      operatorDomain: explicit.domain,
      confidence: 95,
    }
  }

  const normalized = normalizeOperatorForRegistry(operatorName)
  if (!normalized) return null

  for (const entry of [...dbMatches, ...BUILTIN_NON_TELECOM]) {
    if (exactRegistryMatch(normalized, entry.normalizedName)) return entry
  }

  return null
}

export function matchOperatorDomainRegistry(
  operatorName: string,
  dbMatches: OperatorDomainRegistryMatch[] = [],
  countryCode?: string | null,
): OperatorDomainRegistryMatch | null {
  const explicit = detectExplicitServiceDomain(operatorName)
  if (explicit) return null

  const normalized = normalizeOperatorForRegistry(operatorName)
  if (!normalized) return null

  const country = countryCode?.trim().toUpperCase() ?? ''
  const scopedMatches = country
    ? dbMatches.filter((entry) => !entry.countryIso3 || entry.countryIso3.toUpperCase() === country)
    : dbMatches

  for (const entry of scopedMatches) {
    if (entry.operatorDomain !== 'MOBILE') continue
    if (exactMobileBrandMatch(normalized, entry.normalizedName)) return entry
  }

  if (country) {
    for (const entry of BUILTIN_DOMAIN_REGISTRY) {
      if (entry.operatorDomain !== 'MOBILE') continue
      if (exactMobileBrandMatch(normalized, entry.normalizedName)) return entry
    }
    return null
  }

  for (const entry of [...scopedMatches, ...BUILTIN_DOMAIN_REGISTRY]) {
    if (entry.operatorDomain !== 'MOBILE') continue
    if (exactMobileBrandMatch(normalized, entry.normalizedName)) return entry
  }
  return null
}

export function isMobileTelecomDomain(domain: OperatorDomain | string | null | undefined): boolean {
  return String(domain ?? '').toUpperCase() === 'MOBILE'
}
