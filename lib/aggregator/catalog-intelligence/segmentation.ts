import type { NormalizedPlan } from '@/lib/providers/types'
import type { CatalogIntelligenceEngine } from './engine'
import { classifyPlanDomain, classifyNormalizedPlanDomain } from './plan-domain'
import { isMobileTelecomDomain } from './domain-registries'
import type { OperatorDomain, OperatorDomainEvaluation, PlanDomainClassification } from './types'

export type ServiceDomain = OperatorDomain
export type ServiceDomainSegment = {
  serviceDomain: ServiceDomain
  confidence: number
  source: string
  operatorEvaluation: OperatorDomainEvaluation
  planEvaluation?: PlanDomainClassification
  matchedKeywords: string[]
  reasons: string[]
  entersMobileTelecomPipeline: boolean
}

/** Stage 1 — resolve plan service domain. Operator domain always wins over plan keywords. */
export function resolvePlanServiceDomain(input: {
  operatorEvaluation: OperatorDomainEvaluation
  planEvaluation: PlanDomainClassification
}): ServiceDomainSegment {
  const { operatorEvaluation, planEvaluation } = input

  if (operatorEvaluation.isBlockedFromTelecom) {
    return {
      serviceDomain: operatorEvaluation.domain,
      confidence: operatorEvaluation.confidence,
      source: operatorEvaluation.classificationSource,
      operatorEvaluation,
      planEvaluation,
      matchedKeywords: [...operatorEvaluation.matchedKeywords, ...planEvaluation.matchedKeywords],
      reasons: [...operatorEvaluation.reasons, 'operator_domain_overrides_plan_keywords'],
      entersMobileTelecomPipeline: false,
    }
  }

  if (isMobileTelecomDomain(operatorEvaluation.domain)) {
    const serviceDomain = isMobileTelecomDomain(planEvaluation.domain) ? 'MOBILE' : planEvaluation.domain
    return {
      serviceDomain,
      confidence: Math.max(operatorEvaluation.confidence, planEvaluation.confidence),
      source: 'operator_mobile_plan_pattern',
      operatorEvaluation,
      planEvaluation,
      matchedKeywords: [...operatorEvaluation.matchedKeywords, ...planEvaluation.matchedKeywords],
      reasons: [...operatorEvaluation.reasons, ...planEvaluation.reasons],
      entersMobileTelecomPipeline: serviceDomain === 'MOBILE',
    }
  }

  return {
    serviceDomain: operatorEvaluation.domain,
    confidence: operatorEvaluation.confidence,
    source: operatorEvaluation.classificationSource,
    operatorEvaluation,
    planEvaluation,
    matchedKeywords: operatorEvaluation.matchedKeywords,
    reasons: operatorEvaluation.reasons,
    entersMobileTelecomPipeline: false,
  }
}

export function segmentOperatorAtIngestion(
  engine: CatalogIntelligenceEngine,
  input: { operatorName: string; countryCode?: string | null; rawPlans: unknown[] },
): OperatorDomainEvaluation {
  return engine.evaluateOperatorDomain(input)
}

export function segmentPlanAtIngestion(
  engine: CatalogIntelligenceEngine,
  input: {
    operatorName: string
    countryCode?: string | null
    raw: unknown
    operatorEvaluation: OperatorDomainEvaluation
  },
): ServiceDomainSegment {
  const planEvaluation = classifyPlanDomain(input.raw, input.operatorName)
  return resolvePlanServiceDomain({
    operatorEvaluation: input.operatorEvaluation,
    planEvaluation,
  })
}

export function segmentNormalizedPlanAtIngestion(
  engine: CatalogIntelligenceEngine,
  plan: NormalizedPlan,
  operatorEvaluation: OperatorDomainEvaluation,
): ServiceDomainSegment {
  const planEvaluation = classifyNormalizedPlanDomain(plan, plan.operatorName)
  return resolvePlanServiceDomain({ operatorEvaluation, planEvaluation })
}

export function segmentOperatorPlansAtIngestion(
  engine: CatalogIntelligenceEngine,
  input: {
    operatorName: string
    countryCode?: string | null
    plans: Array<{ raw: unknown; plan?: NormalizedPlan }>
  },
): {
  operatorEvaluation: OperatorDomainEvaluation
  planSegments: ServiceDomainSegment[]
  mobilePlanCount: number
  entersMobileTelecomPipeline: boolean
} {
  const operatorEvaluation = segmentOperatorAtIngestion(engine, {
    operatorName: input.operatorName,
    countryCode: input.countryCode,
    rawPlans: input.plans.map((p) => p.raw),
  })

  const planSegments = input.plans.map((entry) =>
    entry.plan
      ? segmentNormalizedPlanAtIngestion(engine, entry.plan, operatorEvaluation)
      : segmentPlanAtIngestion(engine, {
          operatorName: input.operatorName,
          countryCode: input.countryCode,
          raw: entry.raw,
          operatorEvaluation,
        }),
  )

  const mobilePlanCount = planSegments.filter((s) => s.serviceDomain === 'MOBILE').length
  const entersMobileTelecomPipeline =
    isMobileTelecomDomain(operatorEvaluation.domain) &&
    !operatorEvaluation.isBlockedFromTelecom &&
    mobilePlanCount > 0

  return { operatorEvaluation, planSegments, mobilePlanCount, entersMobileTelecomPipeline }
}

export { isMobileTelecomDomain }
