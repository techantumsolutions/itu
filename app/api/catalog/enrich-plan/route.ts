import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { enrichPlanFromRaw, computeRawQuality } from '@/lib/aggregator/catalog-intelligence'

const bodySchema = z.object({
  raw: z.unknown(),
})

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 })
  }

  const enrichment = enrichPlanFromRaw(parsed.data.raw)
  const rawQuality = computeRawQuality(parsed.data.raw)

  return NextResponse.json({
    classification: enrichment.inferredServiceType ?? 'unknown',
    confidenceScore: enrichment.confidenceScore,
    reasons: enrichment.matchedKeywords,
    matchedPatterns: enrichment.matchedKeywords,
    inferredMetadata: {
      normalizedTitle: enrichment.normalizedTitle,
      normalizedDescription: enrichment.normalizedDescription,
      inferredServiceType: enrichment.inferredServiceType,
      inferredSubservice: enrichment.inferredSubservice,
      inferredValidity: enrichment.inferredValidity,
      inferredDataMb: enrichment.inferredDataMb,
      inferredTalktime: enrichment.inferredTalktime,
      inferredSms: enrichment.inferredSms,
      enrichmentSource: enrichment.enrichmentSource,
    },
    rawQuality,
  })
}
