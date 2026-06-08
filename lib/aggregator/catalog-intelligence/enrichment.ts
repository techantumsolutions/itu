import type { EnrichmentResult, RawQualityMetrics } from './types'
import { extractRawPlanFields } from '@/lib/aggregator/telecom-validator'

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

const TELECOM_TITLE_PATTERNS: { regex: RegExp; keyword: string; weight: number }[] = [
  { regex: /\b(\d+(?:\.\d+)?)\s*(gb|mb)\b/i, keyword: 'data_volume', weight: 0.35 },
  { regex: /\b(\d+)\s*(day|days|d)\b/i, keyword: 'validity_days', weight: 0.2 },
  { regex: /\b(combo|bundle|pack|package|unlimited)\b/i, keyword: 'combo', weight: 0.15 },
  { regex: /\b(recharge|topup|top-up|airtime|prepaid|postpaid|talktime|sms|data|roaming)\b/i, keyword: 'telecom_term', weight: 0.15 },
  { regex: /\b(\d+)\s*(min|mins|minutes)\b/i, keyword: 'talktime', weight: 0.15 },
]

const NON_TELECOM_TITLE_PATTERNS: { regex: RegExp; keyword: string }[] = [
  { regex: /\b(gift\s*card|giftcard|voucher|coupon|gaming|game credits|xbox|playstation|steam|roblox|pubg|netflix|spotify|ott|streaming)\b/i, keyword: 'non_telecom_retail' },
  { regex: /\b(amazon|uber|ola|dominos|starbucks|hotel|travel|food delivery)\b/i, keyword: 'non_telecom_service' },
]

export function computeRawQuality(raw: unknown): RawQualityMetrics {
  const fields = extractRawPlanFields(raw)
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const hasDescription = Boolean(fields.description || fields.productName)
  const hasBenefits = fields.benefits.length > 0
  const hasCategory = Boolean(fields.type || fields.serviceName || fields.subserviceName || row.category || row.plan_type)
  const hasAmount = num(row.amount ?? row.retailAmount ?? row.destination?.amount) != null
  const hasValidity = Boolean(row.validity || row.validityDays || fields.description.match(/\b\d+\s*days?\b/i))
  const hasCurrency = Boolean(row.currency || row.retailCurrency || row.destination?.unit)

  const flags = [hasDescription, hasBenefits, hasCategory, hasAmount, hasValidity, hasCurrency]
  const rawCompletenessPercent = Math.round((flags.filter(Boolean).length / flags.length) * 100)
  const rawQualityScore = Math.round(rawCompletenessPercent / 10) / 10

  return {
    rawQualityScore,
    hasDescription,
    hasBenefits,
    hasCategory,
    hasAmount,
    hasValidity,
    hasCurrency,
    rawCompletenessPercent,
  }
}

export function enrichPlanFromRaw(raw: unknown): EnrichmentResult {
  const fields = extractRawPlanFields(raw)
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const title = text(fields.productName || row.name || row.provider_plan_name || fields.description)
  const description = text(fields.description || row.description)
  const combined = `${title} ${description} ${fields.serviceName} ${fields.subserviceName} ${fields.type}`.trim()
  const matchedKeywords: string[] = []
  let score = 0.1

  let inferredDataMb: number | undefined
  let inferredValidity: string | undefined
  let inferredTalktime: string | undefined
  let inferredSms: string | undefined
  let inferredServiceType: string | undefined
  let inferredSubservice: string | undefined

  for (const pattern of TELECOM_TITLE_PATTERNS) {
    const match = combined.match(pattern.regex)
    if (!match) continue
    matchedKeywords.push(pattern.keyword)
    score += pattern.weight

    if (pattern.keyword === 'data_volume') {
      const amount = Number(match[1])
      const unit = String(match[2] || '').toLowerCase()
      inferredDataMb = unit === 'gb' ? amount * 1024 : amount
      inferredServiceType = 'telecom'
      inferredSubservice = 'data'
    }
    if (pattern.keyword === 'validity_days') {
      inferredValidity = `${match[1]} days`
      inferredServiceType = inferredServiceType || 'telecom'
    }
    if (pattern.keyword === 'talktime') {
      inferredTalktime = `${match[1]} minutes`
      inferredServiceType = inferredServiceType || 'telecom'
      inferredSubservice = inferredSubservice || 'voice'
    }
    if (pattern.keyword === 'combo') {
      inferredSubservice = 'combo'
      inferredServiceType = 'telecom'
    }
    if (pattern.keyword === 'telecom_term') {
      inferredServiceType = 'telecom'
      if (/\bsms\b/i.test(combined)) inferredSubservice = inferredSubservice || 'sms'
      if (/\b(data|gb|mb)\b/i.test(combined)) inferredSubservice = inferredSubservice || 'data'
      if (/\b(recharge|topup|airtime|prepaid)\b/i.test(combined)) inferredSubservice = inferredSubservice || 'airtime'
    }
  }

  if (/\bsms\b/i.test(combined)) {
    matchedKeywords.push('sms')
    inferredSms = 'sms pack'
    inferredServiceType = inferredServiceType || 'telecom'
  }

  for (const pattern of NON_TELECOM_TITLE_PATTERNS) {
    if (pattern.regex.test(combined)) matchedKeywords.push(pattern.keyword)
  }

  if (fields.benefits.length > 0) {
    score += 0.1
    inferredServiceType = inferredServiceType || 'telecom'
  }

  return {
    normalizedTitle: title || 'Unknown plan',
    normalizedDescription: description,
    inferredServiceType,
    inferredSubservice,
    inferredValidity,
    inferredDataMb,
    inferredTalktime,
    inferredSms,
    confidenceScore: Math.min(1, Math.max(0, score)),
    enrichmentSource: 'title_intelligence',
    matchedKeywords: [...new Set(matchedKeywords)],
  }
}

export function buildCombinedPlanText(raw: unknown, enrichment?: EnrichmentResult): string {
  const fields = extractRawPlanFields(raw)
  const parts = [
    enrichment?.normalizedTitle,
    enrichment?.normalizedDescription,
    fields.serviceName,
    fields.subserviceName,
    fields.type,
    fields.productName,
    fields.description,
    fields.tags.join(' '),
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}
