import type { TrustedOperatorMatch } from './types'
import { exactMobileBrandMatch, normalizeOperatorForRegistry } from './brand-intelligence'

const BUILTIN_TRUSTED: TrustedOperatorMatch[] = [
  { normalizedName: 'JIO', displayName: 'Jio', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'RELIANCE JIO', displayName: 'Reliance Jio', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'JOI', displayName: 'Joi', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'AIRTEL', displayName: 'Airtel', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'VODAFONE', displayName: 'Vodafone', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'IDEA', displayName: 'Idea', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'VI', displayName: 'Vi', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'BSNL', displayName: 'BSNL', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'MTNL', displayName: 'MTNL', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'MTN', displayName: 'MTN', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'ORANGE', displayName: 'Orange', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'CLARO', displayName: 'Claro', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'GLOBE', displayName: 'Globe', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'SMART', displayName: 'Smart', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'TELKOMSEL', displayName: 'Telkomsel', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'SAFARICOM', displayName: 'Safaricom', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
  { normalizedName: 'GLO', displayName: 'Glo', countryCode: '*', trustLevel: 'HIGH', isVerifiedTelecom: true },
]

export function matchTrustedOperator(
  operatorName: string,
  countryCode?: string | null,
  dbMatches: TrustedOperatorMatch[] = [],
): TrustedOperatorMatch | null {
  const normalized = normalizeOperatorForRegistry(operatorName)
  if (!normalized) return null
  const country = (countryCode ?? '*').trim().toUpperCase() || '*'

  const pool = [...dbMatches, ...BUILTIN_TRUSTED]
  for (const entry of pool) {
    if (!entry) continue
    const entryCountry = entry.countryCode || '*'
    if (entryCountry !== '*' && country !== '*' && entryCountry !== country) continue
    if (exactMobileBrandMatch(normalized, entry.normalizedName)) return entry
  }
  return null
}

export { normalizeOperatorForRegistry } from './brand-intelligence'
