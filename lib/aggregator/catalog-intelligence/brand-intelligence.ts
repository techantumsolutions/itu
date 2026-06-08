import type { OperatorDomain } from './types'

const COUNTRY_TOKENS = new Set([
  'IND',
  'INDIA',
  'UAE',
  'UK',
  'USA',
  'US',
  'GBR',
  'SAU',
  'QAT',
  'PAK',
  'BGD',
  'NPL',
  'PHL',
  'IDN',
  'MYS',
  'SGP',
  'ZAF',
  'NGA',
  'KEN',
  'EGY',
  'FRA',
  'DEU',
  'ESP',
  'ITA',
])

/** Tokens that disqualify mobile-trust inheritance from a root brand. */
const MOBILE_SUBDOMAIN_BLOCKERS = new Set([
  'DTH',
  'TV',
  'SATELLITE',
  'STB',
  'BROADBAND',
  'FIBER',
  'FIBRE',
  'FTTH',
  'DSL',
  'ISP',
  'WIFI',
  'HOTEL',
  'RESORT',
  'CAFE',
  'COFFEE',
  'RESTAURANT',
  'FOOD',
  'GAMING',
  'GAME',
  'STEAM',
  'XBOX',
  'PLAYSTATION',
  'NETFLIX',
  'SPOTIFY',
  'OTT',
  'STREAMING',
  'GIFT',
  'GIFTCARD',
  'GIFT',
  'VOUCHER',
  'COUPON',
  'WALLET',
  'PAYTM',
  'TRAVEL',
  'FLIGHT',
  'UBER',
  'OLA',
  'TAXI',
  'AMAZON',
  'RETAIL',
  'SHOPPING',
  'ELECTRICITY',
  'UTILITY',
  'WATER',
  'GAS',
  'BILL',
  'BROADBAND',
])

export type OperatorBrandProfile = {
  normalized: string
  rootBrand: string
  subserviceTokens: string[]
  countryTokens: string[]
  explicitDomain?: OperatorDomain
  explicitKeyword?: string
}

const EXPLICIT_DOMAIN_OVERRIDES: { regex: RegExp; domain: OperatorDomain; keyword: string }[] = [
  { regex: /\b(dth|satellite|set top|stb|tatasky|dish tv|direct tv|airtel dth)\b/i, domain: 'DTH', keyword: 'dth' },
  { regex: /\b(broadband|fiber|fibre|ftth|dsl|isp|wifi)\b/i, domain: 'UTILITY', keyword: 'broadband' },
  { regex: /\b(hotel|hyatt|marriott|resort|hospitality)\b/i, domain: 'TRAVEL', keyword: 'hotel' },
  { regex: /\b(cafe|coffee day|coffee|restaurant|starbucks|dominos|kfc|mcdonalds|swiggy|zomato|food)\b/i, domain: 'FOOD', keyword: 'food' },
  { regex: /\b(gaming|game credits|steam|xbox|playstation|nintendo|roblox|pubg|assassin|nikke|goddess of victory)\b/i, domain: 'GAMING', keyword: 'gaming' },
  { regex: /\b(netflix|spotify|crunchyroll|disney|hulu|prime video|youtube premium|ott|streaming)\b/i, domain: 'OTT', keyword: 'ott' },
  { regex: /\b(gift\s*card|giftcard|voucher|coupon)\b/i, domain: 'GIFTCARD', keyword: 'giftcard' },
  { regex: /\b(amazon|walmart|myntra|nykaa|bigbasket|retail|shopping)\b/i, domain: 'RETAIL', keyword: 'retail' },
  { regex: /\b(uber|ola|cab|taxi|travel|flight|booking)\b/i, domain: 'TRAVEL', keyword: 'travel' },
  { regex: /\b(paytm|wallet|upi|bank|banking)\b/i, domain: 'WALLET', keyword: 'wallet' },
  { regex: /\b(electricity|water bill|gas bill|utility bill)\b/i, domain: 'UTILITY', keyword: 'utility' },
]

export function normalizeOperatorForRegistry(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/\b(MOBILE|TELECOM|TELECOMMUNICATIONS|LIMITED|LTD|PLC|INC|CORP|CORPORATION|PREPAID|POSTPAID|RECHARGE|TOPUP|TOP UP)\b/g, ' ')
    .replace(/[^A-Z0-9&+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractOperatorBrandProfile(operatorName: string): OperatorBrandProfile {
  const normalized = normalizeOperatorForRegistry(operatorName)
  const tokens = normalized.split(' ').filter(Boolean)
  const rootBrand = tokens[0] ?? ''
  const countryTokens = tokens.filter((t) => COUNTRY_TOKENS.has(t))
  const subserviceTokens = tokens.filter(
    (t) => t !== rootBrand && !COUNTRY_TOKENS.has(t) && MOBILE_SUBDOMAIN_BLOCKERS.has(t),
  )

  for (const override of EXPLICIT_DOMAIN_OVERRIDES) {
    if (override.regex.test(operatorName) || override.regex.test(normalized)) {
      return {
        normalized,
        rootBrand,
        subserviceTokens,
        countryTokens,
        explicitDomain: override.domain,
        explicitKeyword: override.keyword,
      }
    }
  }

  if (subserviceTokens.length > 0) {
    const token = subserviceTokens[0]!
    let explicitDomain: OperatorDomain | undefined
    if (['DTH', 'TV', 'SATELLITE', 'STB'].includes(token)) explicitDomain = 'DTH'
    if (['BROADBAND', 'FIBER', 'FIBRE', 'FTTH', 'DSL', 'ISP', 'WIFI'].includes(token)) explicitDomain = 'UTILITY'
    if (['HOTEL', 'RESORT'].includes(token)) explicitDomain = 'TRAVEL'
    if (['CAFE', 'COFFEE', 'RESTAURANT', 'FOOD'].includes(token)) explicitDomain = 'FOOD'
    if (explicitDomain) {
      return { normalized, rootBrand, subserviceTokens, countryTokens, explicitDomain, explicitKeyword: token.toLowerCase() }
    }
  }

  return { normalized, rootBrand, subserviceTokens, countryTokens }
}

export function hasMobileSubdomainBlocker(normalized: string): boolean {
  const tokens = normalized.split(' ').filter(Boolean)
  return tokens.some((t) => MOBILE_SUBDOMAIN_BLOCKERS.has(t))
}

/** Exact mobile brand match — root brand only, optional country suffix, no subservice tokens. */
export function exactMobileBrandMatch(candidate: string, brand: string): boolean {
  if (!candidate || !brand) return false
  if (hasMobileSubdomainBlocker(candidate)) return false

  const candidateTokens = candidate.split(' ').filter(Boolean)
  const brandTokens = brand.split(' ').filter(Boolean)

  if (candidate === brand) return true
  if (candidateTokens.join(' ') === brandTokens.join(' ')) return true

  if (candidateTokens.length <= brandTokens.length) return false
  if (candidateTokens.slice(0, brandTokens.length).join(' ') !== brandTokens.join(' ')) return false

  const suffix = candidateTokens.slice(brandTokens.length)
  return suffix.every((t) => COUNTRY_TOKENS.has(t))
}

export function detectExplicitServiceDomain(operatorName: string): {
  domain: OperatorDomain
  keyword: string
  profile: OperatorBrandProfile
} | null {
  const profile = extractOperatorBrandProfile(operatorName)
  if (profile.explicitDomain && profile.explicitKeyword) {
    return { domain: profile.explicitDomain, keyword: profile.explicitKeyword, profile }
  }
  return null
}
