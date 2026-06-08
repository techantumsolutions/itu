import type { TrustedOperatorMatch } from './types'

const BUILTIN_TRUSTED: TrustedOperatorMatch[] = [
  { normalizedName: 'JIO', displayName: 'Jio', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'JOI', displayName: 'Joi', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'AIRTEL', displayName: 'Airtel', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'VODAFONE', displayName: 'Vodafone', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'IDEA', displayName: 'Idea', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'VI', displayName: 'Vi', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'BSNL', displayName: 'BSNL', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'MTN', displayName: 'MTN', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'ORANGE', displayName: 'Orange', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'CLARO', displayName: 'Claro', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'GLOBE', displayName: 'Globe', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'SMART', displayName: 'Smart', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'TELKOMSEL', displayName: 'Telkomsel', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'SAFARICOM', displayName: 'Safaricom', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'GLO', displayName: 'Glo', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
]

function normalizeOperatorName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/\b(MOBILE|TELECOM|TELECOMMUNICATIONS|LIMITED|LTD|PLC|INC|CORP|CORPORATION|PREPAID|POSTPAID)\b/g, ' ')
    .replace(/[^A-Z0-9&+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function namesMatch(candidate: string, trusted: string): boolean {
  if (!candidate || !trusted) return false
  if (candidate === trusted) return true
  if (candidate.includes(trusted) || trusted.includes(candidate)) return true
  const candidateTokens = candidate.split(' ').filter(Boolean)
  const trustedTokens = trusted.split(' ').filter(Boolean)
  return trustedTokens.every((t) => candidateTokens.includes(t))
}

export function matchTrustedOperator(
  operatorName: string,
  countryCode?: string | null,
  dbMatches: TrustedOperatorMatch[] = [],
): TrustedOperatorMatch | null {
  const normalized = normalizeOperatorName(operatorName)
  if (!normalized) return null
  const country = (countryCode ?? '*').trim().toUpperCase() || '*'

  const pool = [...dbMatches, ...BUILTIN_TRUSTED]
  for (const entry of pool) {
    if (!entry) continue
    const entryCountry = entry.countryCode || '*'
    if (entryCountry !== '*' && country !== '*' && entryCountry !== country) continue
    if (namesMatch(normalized, entry.normalizedName)) return entry
  }
  return null
}

export function normalizeOperatorForRegistry(name: string): string {
  return normalizeOperatorName(name)
}
