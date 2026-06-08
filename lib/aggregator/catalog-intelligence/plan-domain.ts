import { extractRawPlanFields, isNonTelecomPlanRaw, isTelecomPlanRaw } from '@/lib/aggregator/telecom-validator'
import { classifyPlan } from '@/lib/aggregator/plan-classifier'
import type { NormalizedPlan } from '@/lib/providers/types'
import { enrichPlanFromRaw } from './enrichment'
import type { OperatorDomain, PlanDomainClassification } from './types'

const DOMAIN_FROM_LEGACY: Record<string, OperatorDomain> = {
  GIFT_CARD: 'GIFTCARD',
  STREAMING: 'OTT',
  UTILITY: 'UTILITY',
  PIN: 'GAMING',
  TELECOM: 'MOBILE',
  DATA: 'MOBILE',
  AIRTIME: 'MOBILE',
  COMBO: 'MOBILE',
}

const NON_TELECOM_CATEGORY_TO_DOMAIN: Record<string, OperatorDomain> = {
  GAMING_PROVIDER: 'GAMING',
  SUBSCRIPTION_PROVIDER: 'OTT',
  RETAIL_PROVIDER: 'RETAIL',
  TRAVEL_PROVIDER: 'TRAVEL',
  DIGITAL_PRODUCT_ONLY: 'RETAIL',
}

function textFromRaw(raw: unknown): string {
  const fields = extractRawPlanFields(raw)
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const enrichment = enrichPlanFromRaw(raw)
  return [
    enrichment.normalizedTitle,
    enrichment.normalizedDescription,
    fields.productName,
    fields.description,
    fields.serviceName,
    fields.subserviceName,
    fields.type,
    row.name,
    row.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function domainFromText(text: string): { domain: OperatorDomain; keyword: string } | null {
  if (/\b(dth|satellite tv|set top box|stb)\b/i.test(text)) return { domain: 'DTH', keyword: 'dth' }
  if (/\b(electricity|water bill|gas bill|utility bill|broadband bill)\b/i.test(text)) return { domain: 'UTILITY', keyword: 'utility' }
  if (/\b(bank|wallet topup|upi|credit card bill)\b/i.test(text)) return { domain: 'BANKING', keyword: 'banking' }
  if (/\b(gift\s*card|giftcard|voucher|coupon)\b/i.test(text)) return { domain: 'GIFTCARD', keyword: 'giftcard' }
  if (/\b(game|gaming|xbox|playstation|nintendo|steam|roblox|pubg|assassin|nikke|goddess of victory)\b/i.test(text)) {
    return { domain: 'GAMING', keyword: 'gaming' }
  }
  if (/\b(netflix|spotify|crunchyroll|disney|hulu|prime video|youtube premium|ott|streaming)\b/i.test(text)) {
    return { domain: 'OTT', keyword: 'ott' }
  }
  if (/\b(hotel|hyatt|marriott|travel|flight|booking|uber|ola|taxi)\b/i.test(text)) {
    return { domain: 'TRAVEL', keyword: 'travel' }
  }
  if (/\b(cafe|coffee|restaurant|food|starbucks|dominos|kfc|mcdonalds|swiggy|zomato)\b/i.test(text)) {
    return { domain: 'FOOD', keyword: 'food' }
  }
  if (/\b(amazon|walmart|retail|shopping|myntra|nykaa|bigbasket)\b/i.test(text)) {
    return { domain: 'RETAIL', keyword: 'retail' }
  }
  if (/\b(data|gb|mb|sms|voice|talktime|airtime|recharge|prepaid|postpaid|mobile|bundle|roaming)\b/i.test(text)) {
    return { domain: 'MOBILE', keyword: 'telecom' }
  }
  return null
}

export function classifyPlanDomain(raw: unknown, operatorName?: string): PlanDomainClassification {
  const combined = `${operatorName ?? ''} ${textFromRaw(raw)}`.trim()
  const matchedKeywords: string[] = []
  const reasons: string[] = []

  const nonTelecom = isNonTelecomPlanRaw(raw)
  if (nonTelecom.matches && nonTelecom.category) {
    const domain = NON_TELECOM_CATEGORY_TO_DOMAIN[nonTelecom.category] ?? 'RETAIL'
    matchedKeywords.push(nonTelecom.category)
    reasons.push(`non_telecom_category:${nonTelecom.category}`)
    return { domain, confidence: 88, matchedKeywords, reasons }
  }

  const textHit = domainFromText(combined)
  if (textHit && textHit.domain !== 'MOBILE') {
    matchedKeywords.push(textHit.keyword)
    reasons.push(`text_pattern:${textHit.domain}`)
    return { domain: textHit.domain, confidence: 85, matchedKeywords, reasons }
  }

  if (isTelecomPlanRaw(raw)) {
    matchedKeywords.push('telecom_benefit')
    reasons.push('telecom_raw_signal')
    return { domain: 'MOBILE', confidence: 80, matchedKeywords, reasons }
  }

  const enrichment = enrichPlanFromRaw(raw)
  if (enrichment.inferredServiceType === 'telecom') {
    matchedKeywords.push(...enrichment.matchedKeywords)
    reasons.push('title_intelligence_telecom')
    return { domain: 'MOBILE', confidence: Math.round(enrichment.confidenceScore * 100), matchedKeywords, reasons }
  }

  if (textHit?.domain === 'MOBILE') {
    matchedKeywords.push(textHit.keyword)
    reasons.push('text_pattern:MOBILE')
    return { domain: 'MOBILE', confidence: 70, matchedKeywords, reasons }
  }

  return { domain: 'UNKNOWN', confidence: 30, matchedKeywords, reasons: ['insufficient_domain_signal'] }
}

export function classifyNormalizedPlanDomain(plan: NormalizedPlan, operatorName?: string): PlanDomainClassification {
  const rawResult = classifyPlanDomain(plan.raw ?? plan, operatorName || plan.operatorName)
  const legacy = classifyPlan(plan)
  const legacyDomain = DOMAIN_FROM_LEGACY[legacy.classification]
  if (legacyDomain && legacyDomain !== 'MOBILE' && legacy.confidence >= 0.85) {
    return {
      domain: legacyDomain,
      confidence: Math.round(legacy.confidence * 100),
      matchedKeywords: [...rawResult.matchedKeywords, `legacy:${legacy.classification}`],
      reasons: [...rawResult.reasons, `legacy_classifier:${legacy.classification}`],
    }
  }
  if (legacyDomain === 'MOBILE' && legacy.confidence >= 0.7) {
    return {
      domain: 'MOBILE',
      confidence: Math.max(rawResult.confidence, Math.round(legacy.confidence * 100)),
      matchedKeywords: [...rawResult.matchedKeywords, `legacy:${legacy.classification}`],
      reasons: [...rawResult.reasons, `legacy_classifier:${legacy.classification}`],
    }
  }
  return rawResult
}
