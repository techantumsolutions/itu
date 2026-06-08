import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'
import { aggLoadTrustedOperators } from '@/lib/aggregator/repository'

const bodySchema = z.object({
  raw: z.unknown(),
  operatorName: z.string().optional(),
  countryCode: z.string().optional(),
  providerCategory: z.string().optional(),
})

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 })
  }

  const trustedOperators = await aggLoadTrustedOperators().catch(() => [])
  const engine = new CatalogIntelligenceEngine(trustedOperators)
  const result = engine.classifyRawPlan({
    raw: parsed.data.raw,
    operatorName: parsed.data.operatorName,
    countryCode: parsed.data.countryCode,
    providerCategory: parsed.data.providerCategory,
  })

  return NextResponse.json({
    classification: result.confidenceLevel,
    confidenceScore: result.confidenceScore,
    catalogStatus: result.catalogStatus,
    serviceType: result.serviceType,
    subservice: result.subservice,
    reasons: result.reasons,
    matchedPatterns: result.matchedKeywords,
    layerScores: result.layerScores,
    inferredMetadata: {
      title: result.enrichment.normalizedTitle,
      description: result.enrichment.normalizedDescription,
      validity: result.enrichment.inferredValidity,
      dataMb: result.enrichment.inferredDataMb,
      talktime: result.enrichment.inferredTalktime,
      sms: result.enrichment.inferredSms,
      subservice: result.enrichment.inferredSubservice,
    },
    rawQuality: result.rawQuality,
    shouldPromote: result.shouldPromote,
    shouldQuarantine: result.shouldQuarantine,
    rejectionReason: result.rejectionReason ?? null,
  })
}
