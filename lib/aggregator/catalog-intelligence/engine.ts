import type { NormalizedPlan } from '@/lib/providers/types'
import {
  extractRawPlanFields,
  hasTelecomNegativeSignal,
  hasTelecomPositiveSignal,
  isNonTelecomPlanRaw,
  isTelecomPlanRaw,
} from '@/lib/aggregator/telecom-validator'
import { classifyPlan } from '@/lib/aggregator/plan-classifier'
import { buildCombinedPlanText, computeRawQuality, enrichPlanFromRaw } from './enrichment'
import { matchNonTelecomOperator, matchOperatorDomainRegistry, isMobileTelecomDomain } from './domain-registries'
import { classifyPlanDomain } from './plan-domain'
import { matchTrustedOperator } from './trust-registry'
import type {
  LayerScores,
  NonTelecomOperatorMatch,
  OperatorDomain,
  OperatorDomainEvaluation,
  OperatorDomainRegistryMatch,
  OperatorPromotionOutput,
  PlanCatalogStatus,
  PlanClassificationOutput,
  TelecomConfidenceLevel,
  TrustedOperatorMatch,
} from './types'

const STRONG_NON_TELECOM = new Set(['GIFT_CARD', 'STREAMING', 'UTILITY', 'PIN'])

function scoreToLevel(score: number, suspiciousNonTelecom: boolean, confirmedNonTelecom: boolean): TelecomConfidenceLevel {
  if (confirmedNonTelecom) return 'CONFIRMED_NON_TELECOM'
  if (suspiciousNonTelecom && score < 0.45) return 'SUSPICIOUS_NON_TELECOM'
  if (score >= 0.82) return 'HIGH_CONFIDENCE_TELECOM'
  if (score >= 0.58) return 'MEDIUM_CONFIDENCE_TELECOM'
  if (score >= 0.35) return 'LOW_CONFIDENCE_TELECOM'
  return 'UNKNOWN'
}

function catalogStatusFromLevel(level: TelecomConfidenceLevel): PlanCatalogStatus {
  switch (level) {
    case 'HIGH_CONFIDENCE_TELECOM':
    case 'MEDIUM_CONFIDENCE_TELECOM':
      return 'ACTIVE'
    case 'LOW_CONFIDENCE_TELECOM':
    case 'UNKNOWN':
      return 'REVIEW'
    case 'SUSPICIOUS_NON_TELECOM':
      return 'QUARANTINED'
    case 'CONFIRMED_NON_TELECOM':
      return 'NON_TELECOM'
    default:
      return 'REVIEW'
  }
}

export class CatalogIntelligenceEngine {
  constructor(
    private trustedOperators: TrustedOperatorMatch[] = [],
    private domainRegistry: OperatorDomainRegistryMatch[] = [],
    private nonTelecomRegistry: NonTelecomOperatorMatch[] = [],
  ) {}

  classifyRawPlan(input: {
    raw: unknown
    operatorName?: string
    countryCode?: string | null
    providerCategory?: string | null
  }): PlanClassificationOutput {
    const raw = input.raw
    const enrichment = enrichPlanFromRaw(raw)
    const rawQuality = computeRawQuality(raw)
    const fields = extractRawPlanFields(raw)
    const combinedText = buildCombinedPlanText(raw, enrichment)
    const matchedKeywords = [...enrichment.matchedKeywords]
    const reasons: string[] = []

    const trusted = input.operatorName
      ? matchTrustedOperator(input.operatorName, input.countryCode, this.trustedOperators)
      : null

    const layerScores: LayerScores = {
      trustedOperator: 0,
      titleIntelligence: enrichment.confidenceScore,
      providerCategory: 0,
      benefits: 0,
      negativeSignals: 0,
      pricePattern: 0,
    }

    if (trusted?.isVerifiedTelecom) {
      layerScores.trustedOperator = 0.35
      reasons.push(`trusted_operator:${trusted.displayName}`)
    }

    if (isTelecomPlanRaw(raw)) {
      layerScores.benefits = Math.max(layerScores.benefits, 0.25)
      reasons.push('raw_telecom_signal')
    } else if (fields.benefits.length === 0) {
      reasons.push('missing_benefits_not_penalized')
    } else {
      layerScores.benefits = 0.1
    }

    const providerCategory = String(input.providerCategory || fields.type || fields.serviceName || '').toLowerCase()
    if (/\b(mobile|airtime|data|prepaid|postpaid|bundle|telecom)\b/i.test(providerCategory)) {
      layerScores.providerCategory = 0.15
      reasons.push('provider_category_telecom')
    }

    const nonTelecomRaw = isNonTelecomPlanRaw(raw)
    if (nonTelecomRaw.matches) {
      layerScores.negativeSignals = 0.45
      matchedKeywords.push(nonTelecomRaw.category || 'non_telecom')
      reasons.push(`negative_signal:${nonTelecomRaw.category}`)
    }

    if (enrichment.inferredServiceType === 'telecom') {
      layerScores.titleIntelligence = Math.max(layerScores.titleIntelligence, 0.45)
      reasons.push('title_intelligence_telecom')
    }

    const amount = Number((raw as any)?.amount ?? (raw as any)?.retailAmount ?? 0)
    if (Number.isFinite(amount) && amount > 0 && amount <= 500) {
      layerScores.pricePattern = 0.05
    }

    const weighted =
      layerScores.trustedOperator * 0.35 +
      layerScores.titleIntelligence * 0.3 +
      layerScores.providerCategory * 0.1 +
      layerScores.benefits * 0.15 +
      layerScores.pricePattern * 0.05 -
      layerScores.negativeSignals * 0.35

    let confidenceScore = Math.max(0, Math.min(1, weighted))
    const suspiciousNonTelecom = layerScores.negativeSignals >= 0.35 && confidenceScore < 0.5
    const confirmedNonTelecom =
      nonTelecomRaw.matches &&
      nonTelecomRaw.category === 'DIGITAL_PRODUCT_ONLY' &&
      !trusted?.isVerifiedTelecom &&
      enrichment.inferredServiceType !== 'telecom' &&
      !isTelecomPlanRaw(raw)

    if (confirmedNonTelecom) confidenceScore = Math.min(confidenceScore, 0.15)
    if (trusted?.isVerifiedTelecom && !confirmedNonTelecom) {
      confidenceScore = Math.max(confidenceScore, 0.62)
    }

    const confidenceLevel = scoreToLevel(confidenceScore, suspiciousNonTelecom, confirmedNonTelecom)
    const catalogStatus = catalogStatusFromLevel(confidenceLevel)
    const shouldPromote =
      Boolean(trusted?.isVerifiedTelecom && !confirmedNonTelecom) ||
      confidenceLevel === 'HIGH_CONFIDENCE_TELECOM' ||
      confidenceLevel === 'MEDIUM_CONFIDENCE_TELECOM' ||
      (confidenceLevel === 'LOW_CONFIDENCE_TELECOM' && Boolean(trusted?.isVerifiedTelecom))
    const shouldQuarantine =
      catalogStatus === 'QUARANTINED' || catalogStatus === 'NON_TELECOM' || catalogStatus === 'REVIEW'

    return {
      confidenceLevel,
      confidenceScore,
      serviceType: enrichment.inferredServiceType,
      subservice: enrichment.inferredSubservice,
      reasons,
      matchedKeywords,
      layerScores,
      enrichment,
      catalogStatus,
      shouldPromote,
      shouldQuarantine,
      rejectionReason: confirmedNonTelecom ? 'CONFIRMED_NON_TELECOM' : undefined,
      rawQuality,
    }
  }

  classifyNormalizedPlan(plan: NormalizedPlan, operatorName?: string, countryCode?: string | null): PlanClassificationOutput {
    const rawResult = this.classifyRawPlan({
      raw: plan.raw ?? plan,
      operatorName: operatorName || plan.operatorName,
      countryCode: countryCode || plan.countryIso3,
      providerCategory: plan.category || plan.planType,
    })

    const legacy = classifyPlan(plan)
    if (STRONG_NON_TELECOM.has(legacy.classification) && legacy.confidence >= 0.9) {
      return {
        ...rawResult,
        confidenceLevel: 'CONFIRMED_NON_TELECOM',
        confidenceScore: Math.min(rawResult.confidenceScore, 0.12),
        catalogStatus: 'NON_TELECOM',
        shouldPromote: false,
        shouldQuarantine: true,
        rejectionReason: legacy.reasonCode,
        reasons: [...rawResult.reasons, `legacy_classifier:${legacy.classification}`],
      }
    }

    if (hasTelecomPositiveSignal(plan) && !hasTelecomNegativeSignal(plan).matches) {
      const boosted = Math.max(rawResult.confidenceScore, 0.62)
      const level = scoreToLevel(boosted, false, false)
      return {
        ...rawResult,
        confidenceScore: boosted,
        confidenceLevel: level,
        catalogStatus: catalogStatusFromLevel(level),
        shouldPromote: level === 'HIGH_CONFIDENCE_TELECOM' || level === 'MEDIUM_CONFIDENCE_TELECOM',
        reasons: [...rawResult.reasons, 'normalized_positive_signal'],
      }
    }

    return rawResult
  }

  evaluateOperatorDomain(input: {
    operatorName: string
    countryCode?: string | null
    rawPlans?: unknown[]
  }): OperatorDomainEvaluation {
    const reasons: string[] = []
    const matchedKeywords: string[] = []
    const matchedRules: string[] = []
    const domainBreakdown: Record<string, number> = {}
    const rawPlans = input.rawPlans ?? []

    const trusted = matchTrustedOperator(input.operatorName, input.countryCode, this.trustedOperators)
    if (trusted?.isVerifiedTelecom) {
      return {
        domain: 'MOBILE',
        confidence: 95,
        reasons: [`trusted_telecom_registry:${trusted.displayName}`],
        matchedKeywords: [trusted.normalizedName],
        matchedRules: ['layer1_trusted_telecom_registry'],
        classificationSource: 'trusted_telecom_registry',
        isBlockedFromTelecom: false,
        domainBreakdown: { MOBILE: rawPlans.length || 1 },
      }
    }

    const domainRegistryHit = matchOperatorDomainRegistry(input.operatorName, this.domainRegistry)
    if (domainRegistryHit?.operatorDomain === 'MOBILE') {
      return {
        domain: 'MOBILE',
        confidence: domainRegistryHit.confidence,
        reasons: [`operator_domain_registry:${domainRegistryHit.operatorName}`],
        matchedKeywords: [domainRegistryHit.normalizedName],
        matchedRules: ['layer1_operator_domain_registry'],
        classificationSource: 'operator_domain_registry',
        isBlockedFromTelecom: false,
        domainBreakdown: { MOBILE: rawPlans.length || 1 },
      }
    }

    const nonTelecomHit = matchNonTelecomOperator(input.operatorName, this.nonTelecomRegistry)
    if (nonTelecomHit) {
      domainBreakdown[nonTelecomHit.operatorDomain] = rawPlans.length || 1
      return {
        domain: nonTelecomHit.operatorDomain,
        confidence: nonTelecomHit.confidence,
        reasons: [`non_telecom_registry:${nonTelecomHit.operatorName}`],
        matchedKeywords: [nonTelecomHit.normalizedName],
        matchedRules: ['layer2_non_telecom_registry'],
        classificationSource: 'non_telecom_registry',
        isBlockedFromTelecom: true,
        domainBreakdown,
        rejectionReason: `NON_MOBILE_DOMAIN:${nonTelecomHit.operatorDomain}`,
      }
    }

    for (const raw of rawPlans) {
      const planDomain = classifyPlanDomain(raw, input.operatorName)
      domainBreakdown[planDomain.domain] = (domainBreakdown[planDomain.domain] ?? 0) + 1
      matchedKeywords.push(...planDomain.matchedKeywords)
    }

    const totalPlans = rawPlans.length
    let dominantDomain: OperatorDomain = 'UNKNOWN'
    let dominantCount = 0
    for (const [domain, count] of Object.entries(domainBreakdown)) {
      if (count > dominantCount) {
        dominantDomain = domain as OperatorDomain
        dominantCount = count
      }
    }

    if (totalPlans > 0) {
      const mobileCount = domainBreakdown.MOBILE ?? 0
      const mobileRatio = mobileCount / totalPlans
      matchedRules.push('layer3_plan_pattern_analysis')

      if (mobileRatio >= 0.6 && mobileCount > 0) {
        reasons.push(`dominant_mobile_plans:${Math.round(mobileRatio * 100)}%`)
        return {
          domain: 'MOBILE',
          confidence: Math.round(mobileRatio * 100),
          reasons,
          matchedKeywords: [...new Set(matchedKeywords)],
          matchedRules,
          classificationSource: 'plan_pattern_analysis',
          isBlockedFromTelecom: false,
          domainBreakdown,
        }
      }

      if (dominantDomain !== 'UNKNOWN' && dominantDomain !== 'MOBILE') {
        const ratio = dominantCount / totalPlans
        reasons.push(`dominant_non_mobile_domain:${dominantDomain}`)
        return {
          domain: dominantDomain,
          confidence: Math.round(ratio * 100),
          reasons,
          matchedKeywords: [...new Set(matchedKeywords)],
          matchedRules,
          classificationSource: 'plan_pattern_analysis',
          isBlockedFromTelecom: true,
          domainBreakdown,
          rejectionReason: `DOMINANT_NON_MOBILE:${dominantDomain}`,
        }
      }
    }

    return {
      domain: 'UNKNOWN',
      confidence: 40,
      reasons: totalPlans ? ['insufficient_mobile_dominance'] : ['no_plans_for_domain_analysis'],
      matchedKeywords: [...new Set(matchedKeywords)],
      matchedRules: ['layer3_plan_pattern_analysis'],
      classificationSource: 'unknown',
      isBlockedFromTelecom: false,
      domainBreakdown,
    }
  }

  evaluateOperatorPromotion(input: {
    operatorName: string
    countryCode?: string | null
    rawPlans: unknown[]
    failedSyncCount?: number
    hasTelecomHistory?: boolean
  }): OperatorPromotionOutput {
    const domainEval = this.evaluateOperatorDomain(input)
    const trusted = matchTrustedOperator(input.operatorName, input.countryCode, this.trustedOperators)
    const classifications = input.rawPlans.map((raw) =>
      this.classifyRawPlan({ raw, operatorName: input.operatorName, countryCode: input.countryCode }),
    )

    const baseReasons = [...domainEval.reasons]
    if (!isMobileTelecomDomain(domainEval.domain)) {
      const shouldDeactivate =
        domainEval.isBlockedFromTelecom &&
        (input.failedSyncCount ?? 0) >= 1 &&
        !trusted?.isVerifiedTelecom

      return {
        shouldPromote: false,
        shouldDeactivate,
        confidenceLevel: 'CONFIRMED_NON_TELECOM',
        confidenceScore: domainEval.confidence / 100,
        reasons: [...baseReasons, `domain_gate:${domainEval.domain}`],
        trustedOperator: Boolean(trusted?.isVerifiedTelecom),
        telecomPlanCount: 0,
        mediumConfidencePlanCount: 0,
        lowConfidencePlanCount: 0,
        confirmedNonTelecomCount: classifications.filter((c) => c.confidenceLevel === 'CONFIRMED_NON_TELECOM').length,
        totalPlanCount: input.rawPlans.length,
        telecomRatio: 0,
        failedSyncCount: input.failedSyncCount,
        operatorDomain: domainEval.domain,
        operatorDomainConfidence: domainEval.confidence,
        domainClassificationSource: domainEval.classificationSource,
        domainBlocked: domainEval.isBlockedFromTelecom,
        domainEvaluation: domainEval,
      }
    }

    const totalPlanCount = classifications.length
    const telecomPlanCount = classifications.filter((c, index) => {
      if (['HIGH_CONFIDENCE_TELECOM', 'MEDIUM_CONFIDENCE_TELECOM', 'LOW_CONFIDENCE_TELECOM'].includes(c.confidenceLevel)) {
        return true
      }
      return isTelecomPlanRaw(input.rawPlans[index])
    }).length
    const mediumConfidencePlanCount = classifications.filter((c) =>
      ['HIGH_CONFIDENCE_TELECOM', 'MEDIUM_CONFIDENCE_TELECOM'].includes(c.confidenceLevel),
    ).length
    const lowConfidencePlanCount = classifications.filter((c) => c.confidenceLevel === 'LOW_CONFIDENCE_TELECOM').length
    const confirmedNonTelecomCount = classifications.filter((c) => c.confidenceLevel === 'CONFIRMED_NON_TELECOM').length
    const telecomRatio = totalPlanCount > 0 ? telecomPlanCount / totalPlanCount : 0
    const reasons: string[] = []

    let shouldPromote = isMobileTelecomDomain(domainEval.domain)
    if (trusted?.isVerifiedTelecom) {
      shouldPromote = true
      reasons.push('trusted_operator_registry')
    }
    if (input.hasTelecomHistory && isMobileTelecomDomain(domainEval.domain)) {
      shouldPromote = true
      reasons.push('telecom_history')
    }
    if (telecomPlanCount >= 1 && isMobileTelecomDomain(domainEval.domain)) {
      shouldPromote = true
      reasons.push('at_least_one_telecom_plan')
    }
    if (mediumConfidencePlanCount >= 1 && isMobileTelecomDomain(domainEval.domain)) {
      shouldPromote = true
      reasons.push('medium_confidence_plan_exists')
    }
    if (domainEval.domain === 'UNKNOWN' && telecomPlanCount >= 1 && trusted?.isVerifiedTelecom) {
      shouldPromote = true
      reasons.push('trusted_with_telecom_plans')
    }

    const failedSyncCount = input.failedSyncCount ?? 0
    const strongNonTelecomDominance =
      totalPlanCount > 0 && confirmedNonTelecomCount === totalPlanCount && !trusted?.isVerifiedTelecom

    let shouldDeactivate = false
    if (
      failedSyncCount >= 3 &&
      strongNonTelecomDominance &&
      !trusted?.isVerifiedTelecom &&
      !input.hasTelecomHistory &&
      telecomPlanCount === 0
    ) {
      shouldDeactivate = true
      reasons.push('repeated_failed_sync_strong_non_telecom')
    }

    if (totalPlanCount === 0 && failedSyncCount >= 3 && !trusted?.isVerifiedTelecom) {
      shouldDeactivate = true
      reasons.push('no_plans_after_repeated_sync_failures')
    }

    const avgScore =
      totalPlanCount > 0
        ? classifications.reduce((sum, c) => sum + c.confidenceScore, 0) / totalPlanCount
        : trusted?.isVerifiedTelecom
          ? 0.7
          : 0

    const confidenceLevel = trusted?.isVerifiedTelecom
      ? 'HIGH_CONFIDENCE_TELECOM'
      : scoreToLevel(avgScore, false, strongNonTelecomDominance)

    return {
      shouldPromote,
      shouldDeactivate,
      confidenceLevel,
      confidenceScore: avgScore,
      reasons: [...baseReasons, ...reasons],
      trustedOperator: Boolean(trusted?.isVerifiedTelecom),
      telecomPlanCount,
      mediumConfidencePlanCount,
      lowConfidencePlanCount,
      confirmedNonTelecomCount,
      totalPlanCount,
      telecomRatio,
      failedSyncCount,
      operatorDomain: domainEval.domain,
      operatorDomainConfidence: domainEval.confidence,
      domainClassificationSource: domainEval.classificationSource,
      domainBlocked: false,
      domainEvaluation: domainEval,
    }
  }
}

export const defaultCatalogIntelligenceEngine = new CatalogIntelligenceEngine()
