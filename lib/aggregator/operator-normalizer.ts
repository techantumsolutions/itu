import type { NormalizedPlan } from '@/lib/providers/types'
import { normalizeText, slugify } from '@/lib/aggregator/signature'
import type { SystemOperatorInput } from '@/lib/aggregator/types'

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

export function canonicalOperatorName(input: string): string {
  const words = normalizeText(input)
    .split(' ')
    .filter((word) => word && !NOISE_WORDS.has(word))
  return words.join(' ').trim()
}

export function operatorKey(name: string, countryId: string): string {
  return `${countryId}:${canonicalOperatorName(name)}`
}

export function buildSystemOperatorInput(plan: NormalizedPlan): SystemOperatorInput {
  const country = plan.countryIso3 || 'UNK'
  const baseName = canonicalOperatorName(plan.operatorName || plan.operatorRef || 'Unknown Operator')
  const displayName = baseName
    ? `${baseName
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase())} ${country}`
    : `Operator ${country}`

  return {
    systemOperatorName: displayName,
    slug: slugify(displayName),
    countryId: country,
    logo: null,
    operatorType: plan.service || 'Mobile',
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
