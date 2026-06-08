import { NextResponse } from 'next/server'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { aggLoadCatalogIntelligenceRegistries } from '@/lib/aggregator/repository'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    operatorName?: string
    countryCode?: string
    rawPlans?: unknown[]
  }
  const operatorName = String(body.operatorName ?? '').trim()
  if (!operatorName) {
    return NextResponse.json({ error: 'operatorName is required' }, { status: 400 })
  }

  const { trustedOperators, domainRegistry, nonTelecomRegistry } = await aggLoadCatalogIntelligenceRegistries().catch(() => ({
    trustedOperators: [],
    domainRegistry: [],
    nonTelecomRegistry: [],
  }))
  const engine = new CatalogIntelligenceEngine(trustedOperators, domainRegistry, nonTelecomRegistry)
  const domainEval = engine.evaluateOperatorDomain({
    operatorName,
    countryCode: body.countryCode,
    rawPlans: Array.isArray(body.rawPlans) ? body.rawPlans : [],
  })
  const promotionEval = engine.evaluateOperatorPromotion({
    operatorName,
    countryCode: body.countryCode,
    rawPlans: Array.isArray(body.rawPlans) ? body.rawPlans : [],
  })

  return NextResponse.json({
    domain: domainEval.domain,
    confidence: domainEval.confidence,
    classificationSource: domainEval.classificationSource,
    reasons: domainEval.reasons,
    matchedPatterns: domainEval.matchedKeywords,
    matchedRules: domainEval.matchedRules,
    domainBreakdown: domainEval.domainBreakdown,
    isBlockedFromTelecom: domainEval.isBlockedFromTelecom,
    rejectionReason: domainEval.rejectionReason ?? null,
    shouldPromoteToMobileCatalog: promotionEval.shouldPromote && promotionEval.operatorDomain === 'MOBILE',
    promotion: promotionEval,
  })
}
