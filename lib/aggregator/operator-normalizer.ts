import type { NormalizedPlan } from '@/lib/providers/types'
import { isGenuineTelecomOperatorName } from '@/lib/aggregator/operator-classifier'
import { normalizeText, slugify } from '@/lib/aggregator/signature'
import type { SystemOperatorInput } from '@/lib/aggregator/types'
import { COUNTRY_NAMES, ISO2_TO_ISO3 } from '@/lib/lcr/countries'

const NOISE_WORDS = new Set([
  'MOBILE',
  'TELECOM',
  'TELECOMMUNICATION',
  'TELECOMMUNICATIONS',
  'PREPAID',
  'POSTPAID',
  'GSM',
  'LIMITED',
  'LTD',
  'INC',
  'LLC',
])

const COUNTRY_WORDS = new Set<string>()
for (const a2 of Object.keys(ISO2_TO_ISO3)) {
  COUNTRY_WORDS.add(a2.toUpperCase())
}
for (const a3 of Object.values(ISO2_TO_ISO3)) {
  COUNTRY_WORDS.add(a3.toUpperCase())
}
for (const name of Object.values(COUNTRY_NAMES)) {
  const parts = name.toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  for (const part of parts) {
    if (part.length > 2) {
      COUNTRY_WORDS.add(part)
    }
  }
}
// Additional country/region name tokens
COUNTRY_WORDS.add('INDIA')
COUNTRY_WORDS.add('MEXICO')
COUNTRY_WORDS.add('JAMAICA')
COUNTRY_WORDS.add('PUERTO')
COUNTRY_WORDS.add('RICO')

export function canonicalOperatorName(input: string): string {
  const words = normalizeText(input)
    .split(' ')
    .filter((word) => word && !NOISE_WORDS.has(word) && !COUNTRY_WORDS.has(word))
  return words.join(' ').trim()
}

export function operatorKey(name: string, countryId: string): string {
  return `${countryId}:${canonicalOperatorName(name)}`
}

function titleCaseWords(input: string): string {
  return input
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

export function buildSystemOperatorInput(
  plan: NormalizedPlan,
  telecomOperatorName?: string,
): SystemOperatorInput | null {
  const country = plan.countryIso3 || 'UNK'
  const resolvedName = telecomOperatorName?.trim() || plan.operatorName?.trim() || ''
  if (!resolvedName) return null
  if (!telecomOperatorName && !isGenuineTelecomOperatorName(resolvedName, country)) return null

  const baseName = canonicalOperatorName(resolvedName)
  const displayName = baseName ? `${titleCaseWords(baseName)} ${country}` : `Operator ${country}`

  return {
    systemOperatorName: displayName,
    slug: slugify(displayName),
    countryId: country,
    logo: null,
    operatorType: 'TELECOM',
    status: 'ACTIVE',
  }
}

export function operatorMatchConfidence(a: string, b: string): number {
  const left = canonicalOperatorName(a)
  const right = canonicalOperatorName(b)
  if (!left || !right) return 0
  if (left === right) return 100
  if (left.includes(right) || right.includes(left)) return 90
  const leftWords = new Set(left.split(' '))
  const rightWords = new Set(right.split(' '))
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length
  const total = new Set([...leftWords, ...rightWords]).size
  return total ? Math.round((shared / total) * 80) : 0
}
