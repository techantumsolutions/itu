import { slugify } from '@/lib/aggregator/signature'
import { normalizeOperatorForRegistry } from '@/lib/aggregator/catalog-intelligence/brand-intelligence'

const NOISE_TOKENS = new Set([
  'MOBILE',
  'TELECOM',
  'TELECOMMUNICATIONS',
  'LIMITED',
  'LTD',
  'PLC',
  'INC',
  'CORP',
  'CORPORATION',
  'PREPAID',
  'POSTPAID',
  'RECHARGE',
  'TOPUP',
  'TOP',
  'UP',
  'CELLULAR',
  'WIRELESS',
  'NETWORK',
  'NETWORKS',
  'COMMUNICATIONS',
  'COMMUNICATION',
])

/** Canonical registry key for an operator within a country. */
export function normalizeRegistryOperatorName(name: string): string {
  return normalizeOperatorForRegistry(name)
    .split(' ')
    .filter((token) => token && !NOISE_TOKENS.has(token))
    .join(' ')
    .trim()
}

/** Lowercase alias token used for alias matching. */
export function normalizeRegistryAlias(name: string): string {
  return normalizeRegistryOperatorName(name).toLowerCase()
}

export function registryOperatorSlug(operatorName: string, countryIso3: string): string {
  const base = slugify(`${operatorName}-${countryIso3}`)
  return base || slugify(countryIso3) || 'operator'
}

export function uniqueAliases(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const alias = normalizeRegistryAlias(value)
    if (!alias || seen.has(alias)) continue
    seen.add(alias)
    out.push(alias)
  }
  return out
}

export function displayOperatorNameFromNetwork(network: string): string {
  const normalized = normalizeRegistryOperatorName(network)
  if (!normalized) return network.trim()
  return normalized
    .split(' ')
    .map((part) => (part.length <= 3 ? part : part[0] + part.slice(1).toLowerCase()))
    .join(' ')
}
