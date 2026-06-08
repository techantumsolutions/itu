import { normalizeOperatorForRegistry } from './trust-registry'
import type { NonTelecomOperatorMatch, OperatorDomain, OperatorDomainRegistryMatch } from './types'

export { normalizeOperatorForRegistry }

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

const OPERATOR_NAME_DOMAIN_PATTERNS: { regex: RegExp; domain: OperatorDomain; keyword: string }[] = [
  { regex: /\b(cafe|coffee day|starbucks|dominos|kfc|mcdonalds|swiggy|zomato|food)\b/i, domain: 'FOOD', keyword: 'food_brand' },
  { regex: /\b(hyatt|marriott|hotel|easemytrip|booking\.com|travel)\b/i, domain: 'TRAVEL', keyword: 'travel_brand' },
  { regex: /\b(steam|xbox|playstation|nintendo|roblox|pubg|assassin|nikke|goddess of victory|game credits|gaming)\b/i, domain: 'GAMING', keyword: 'gaming_brand' },
  { regex: /\b(netflix|spotify|crunchyroll|disney|hulu|prime video|youtube premium|ott)\b/i, domain: 'OTT', keyword: 'ott_brand' },
  { regex: /\b(amazon|walmart|myntra|nykaa|bigbasket|retail|gift card|giftcard)\b/i, domain: 'RETAIL', keyword: 'retail_brand' },
  { regex: /\b(uber|ola|cab|taxi)\b/i, domain: 'TRAVEL', keyword: 'ride_brand' },
  { regex: /\b(dth|tatasky|airtel dth|dish tv)\b/i, domain: 'DTH', keyword: 'dth_brand' },
  { regex: /\b(electricity|water bill|gas bill|utility)\b/i, domain: 'UTILITY', keyword: 'utility_brand' },
]

function namesMatch(candidate: string, target: string): boolean {
  if (!candidate || !target) return false
  if (candidate === target) return true
  if (candidate.includes(target) || target.includes(candidate)) return true
  const candidateTokens = candidate.split(' ').filter(Boolean)
  const targetTokens = target.split(' ').filter(Boolean)
  if (targetTokens.length === 1 && targetTokens[0]!.length >= 4) {
    return candidateTokens.some((t) => t === targetTokens[0] || t.startsWith(targetTokens[0]!))
  }
  return targetTokens.every((t) => candidateTokens.includes(t))
}

export function matchNonTelecomOperator(
  operatorName: string,
  dbMatches: NonTelecomOperatorMatch[] = [],
): NonTelecomOperatorMatch | null {
  const normalized = normalizeOperatorForRegistry(operatorName)
  if (!normalized) return null
  for (const entry of [...dbMatches, ...BUILTIN_NON_TELECOM]) {
    if (namesMatch(normalized, entry.normalizedName)) return entry
  }
  for (const pattern of OPERATOR_NAME_DOMAIN_PATTERNS) {
    if (pattern.domain === 'MOBILE') continue
    if (pattern.regex.test(operatorName)) {
      return {
        normalizedName: normalized,
        operatorName,
        operatorDomain: pattern.domain,
        confidence: 90,
      }
    }
  }
  return null
}

export function matchOperatorDomainRegistry(
  operatorName: string,
  dbMatches: OperatorDomainRegistryMatch[] = [],
): OperatorDomainRegistryMatch | null {
  const normalized = normalizeOperatorForRegistry(operatorName)
  if (!normalized) return null
  for (const entry of [...dbMatches, ...BUILTIN_DOMAIN_REGISTRY]) {
    if (namesMatch(normalized, entry.normalizedName)) return entry
  }
  return null
}

export function isMobileTelecomDomain(domain: OperatorDomain | string | null | undefined): boolean {
  return String(domain ?? '').toUpperCase() === 'MOBILE'
}
