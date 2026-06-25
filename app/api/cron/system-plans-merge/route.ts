import { NextResponse } from 'next/server'
import { sweepDuplicateSystemPlans } from '@/lib/aggregator/system-plan-duplicate-sweep'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const configuredSecret = process.env.CRON_SECRET
  if (configuredSecret && authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 })
  }

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
