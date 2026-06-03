import type { NormalizedPlan } from '@/lib/providers/types'
import { normalizeText, slugify } from '@/lib/aggregator/signature'
import {
  isDynamicCatalogSchemaReady,
  loadTelecomKeywordRules,
  loadTelecomNormalizationTokens,
  type TelecomKeywordRuleRow,
  type TelecomNormalizationTokenRow,
} from '@/lib/aggregator/dynamic-repository'

export type DynamicTelecomCategory =
  | 'MOBILE_OPERATOR'
  | 'MOBILE_PLAN'
  | 'AIRTIME'
  | 'DATA_BUNDLE'
  | 'VOICE_BUNDLE'
  | 'SMS_BUNDLE'
  | 'COMBO_BUNDLE'
  | 'GIFT_CARD'
  | 'OTT'
  | 'DTH'
  | 'UTILITY'
  | 'DIGITAL_VOUCHER'
  | 'UNKNOWN'

export type DynamicClassificationResult = {
  category: DynamicTelecomCategory
  isTelecom: boolean
  confidence: number
  reasons: string[]
}

type DynamicFieldBag = {
  operatorName: string
  planName: string
  serviceType: string
  category: string
  tags: string
  benefits: string
  metadata: string
}

let ruleCache: { at: number; rows: TelecomKeywordRuleRow[] } | null = null
let tokenCache: Record<string, { at: number; rows: TelecomNormalizationTokenRow[] }> = {}

const CACHE_MS = 60_000

function nowMs(): number {
  return Date.now()
}

async function getRules(): Promise<TelecomKeywordRuleRow[]> {
  if (ruleCache && nowMs() - ruleCache.at < CACHE_MS) return ruleCache.rows
  const rows = await loadTelecomKeywordRules().catch(() => [])
  ruleCache = { at: nowMs(), rows }
  return rows
}

async function getTokens(scope: string): Promise<TelecomNormalizationTokenRow[]> {
  const key = scope || 'GLOBAL'
  const existing = tokenCache[key]
  if (existing && nowMs() - existing.at < CACHE_MS) return existing.rows
  const rows = await loadTelecomNormalizationTokens(scope).catch(() => [])
  tokenCache[key] = { at: nowMs(), rows }
  return rows
}

function matchRule(rule: TelecomKeywordRuleRow, fields: DynamicFieldBag): boolean {
  const targets =
    rule.target_field === 'ANY'
      ? [
          fields.operatorName,
          fields.planName,
          fields.serviceType,
          fields.category,
          fields.tags,
          fields.benefits,
          fields.metadata,
        ]
      : [mapField(rule.target_field, fields)]

  const keyword = String(rule.keyword ?? '').trim()
  if (!keyword) return false
  if (rule.is_regex) {
    try {
      const re = new RegExp(keyword, 'i')
      return targets.some((t) => re.test(t))
    } catch {
      return false
    }
  }
  const normalizedKeyword = normalizeText(keyword)
  return targets.some((t) => normalizeText(t).includes(normalizedKeyword))
}

function mapField(field: string, fields: DynamicFieldBag): string {
  switch ((field || '').toUpperCase()) {
    case 'OPERATOR_NAME':
      return fields.operatorName
    case 'PLAN_NAME':
      return fields.planName
    case 'SERVICE_TYPE':
      return fields.serviceType
    case 'CATEGORY':
      return fields.category
    case 'TAGS':
      return fields.tags
    case 'BENEFITS':
      return fields.benefits
    case 'METADATA':
      return fields.metadata
    default:
      return fields.operatorName
  }
}

function duplicateConfidence(score: number): 'exact' | 'high' | 'medium' | 'low' {
  if (score >= 95) return 'exact'
  if (score >= 80) return 'high'
  if (score >= 60) return 'medium'
  return 'low'
}

export async function classifyTelecomRecordDynamic(input: {
  providerOperatorName: string
  planName?: string | null
  serviceType?: string | null
  category?: string | null
  tags?: string[]
  benefits?: unknown
  metadata?: unknown
}): Promise<DynamicClassificationResult> {
  const rules = await getRules()
  if (!rules.length) {
    return {
      category: 'UNKNOWN',
      isTelecom: false,
      confidence: 0,
      reasons: ['no_dynamic_rules'],
    }
  }

  const fields: DynamicFieldBag = {
    operatorName: input.providerOperatorName ?? '',
    planName: input.planName ?? '',
    serviceType: input.serviceType ?? '',
    category: input.category ?? '',
    tags: (input.tags ?? []).join(' '),
    benefits: JSON.stringify(input.benefits ?? {}),
    metadata: JSON.stringify(input.metadata ?? {}),
  }

  let includeScore = 0
  let excludeScore = 0
  const reasons: string[] = []
  const categories = new Map<string, number>()

  for (const rule of rules) {
    if (!matchRule(rule, fields)) continue
    const weight = Number(rule.weight ?? 1)
    const type = String(rule.rule_type || '').toUpperCase()
    const category = String(rule.category || 'UNKNOWN').toUpperCase()

    categories.set(category, (categories.get(category) ?? 0) + weight)
    reasons.push(`${type}:${category}:${rule.keyword}`)

    if (type === 'INCLUDE_TELECOM') includeScore += weight
    if (type === 'EXCLUDE_NON_TELECOM') excludeScore += weight
  }

  const bestCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UNKNOWN'
  const confidence = Math.max(0, Math.min(100, Math.round((includeScore - excludeScore + 10) * 5)))
  const telecom = includeScore > excludeScore && !['GIFT_CARD', 'OTT', 'DTH', 'UTILITY', 'DIGITAL_VOUCHER'].includes(bestCategory)

  return {
    category: (bestCategory as DynamicTelecomCategory) ?? 'UNKNOWN',
    isTelecom: telecom,
    confidence,
    reasons: reasons.slice(0, 20),
  }
}

export async function normalizeOperatorNameDynamic(input: {
  operatorName: string
  countryIso3: string
}): Promise<{ normalizedName: string; displayName: string; slug: string }> {
  const source = String(input.operatorName ?? '').trim()
  const country = String(input.countryIso3 ?? '').trim().toUpperCase()
  const tokens = await getTokens(country)

  const drop = new Set(
    tokens
      .filter((t) => t.is_active)
      .map((t) => normalizeText(t.token))
      .filter(Boolean),
  )

  const words = normalizeText(source)
    .split(' ')
    .filter(Boolean)
    .filter((w) => !drop.has(w))

  const normalized = words.join(' ').trim() || normalizeText(source)
  const displayName = normalized
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim()

  return {
    normalizedName: normalized,
    displayName: displayName || source,
    slug: slugify(`${displayName || source}-${country}`),
  }
}

export function scoreAggregateOperatorCandidate(input: {
  normalizedName: string
  countryIso3: string
  aliasName: string
  classificationConfidence: number
}): { score: number; confidence: 'exact' | 'high' | 'medium' | 'low' } {
  const base = input.classificationConfidence
  const aliasPenalty = normalizeText(input.aliasName) === normalizeText(input.normalizedName) ? 0 : 5
  const score = Math.max(0, Math.min(100, Math.round(base - aliasPenalty)))
  return { score, confidence: duplicateConfidence(score) }
}

export async function canUseDynamicClassification(): Promise<boolean> {
  return isDynamicCatalogSchemaReady()
}

export function resetDynamicClassifierCache(): void {
  ruleCache = null
  tokenCache = {}
}
