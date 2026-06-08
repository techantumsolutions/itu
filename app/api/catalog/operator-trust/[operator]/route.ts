import { NextResponse } from 'next/server'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { aggLoadTrustedOperators } from '@/lib/aggregator/repository'
import { matchTrustedOperator } from '@/lib/aggregator/catalog-intelligence/trust-registry'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'

type RouteParams = { params: Promise<{ operator: string }> }

export async function GET(request: Request, context: RouteParams) {
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { operator } = await context.params
  const operatorName = decodeURIComponent(operator || '').trim()
  if (!operatorName) {
    return NextResponse.json({ error: 'Operator name required' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const countryCode = searchParams.get('country') || searchParams.get('countryCode') || undefined

  const trustedOperators = await aggLoadTrustedOperators().catch(() => [])
  const match = matchTrustedOperator(operatorName, countryCode, trustedOperators)
  const engine = new CatalogIntelligenceEngine(trustedOperators)
  const promotion = engine.evaluateOperatorPromotion({
    operatorName,
    countryCode,
    rawPlans: [],
    hasTelecomHistory: false,
  })

  return NextResponse.json({
    operator: operatorName,
    countryCode: countryCode ?? null,
    trusted: Boolean(match?.isVerifiedTelecom),
    trustLevel: match?.trustLevel ?? null,
    displayName: match?.displayName ?? null,
    classification: match?.isVerifiedTelecom ? 'HIGH_CONFIDENCE_TELECOM' : promotion.confidenceLevel,
    confidenceScore: match?.isVerifiedTelecom ? 0.9 : promotion.confidenceScore,
    reasons: match
      ? [`trusted_operator_registry:${match.displayName}`]
      : promotion.reasons.length
        ? promotion.reasons
        : ['not_in_trust_registry'],
    matchedPatterns: match ? [match.normalizedName] : [],
    shouldPromote: match?.isVerifiedTelecom || promotion.shouldPromote,
  })
}
