import { NextResponse } from 'next/server'
import { requireBearerSecret } from '@/lib/security/require-secret'
import { sweepDuplicateSystemPlans } from '@/lib/aggregator/system-plan-duplicate-sweep'

export async function POST(request: Request) {
  const denied = requireBearerSecret(request, 'CRON_SECRET', {
    missingMessage: 'CRON_SECRET is not configured',
    unauthorizedMessage: 'Unauthorized cron request',
  })
  if (denied) return denied

  try {
    const result = await sweepDuplicateSystemPlans()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Plan merge sweep failed' },
      { status: 500 },
    )
  }
}
