import { NextResponse } from 'next/server'
import { requireBearerSecret } from '@/lib/security/require-secret'
import { sweepDuplicateSystemPlans } from '@/lib/aggregator/system-plan-duplicate-sweep'
import { withRedisLock } from '@/lib/cache/redis-lock'

export async function POST(request: Request) {
  const denied = requireBearerSecret(request, 'CRON_SECRET', {
    missingMessage: 'CRON_SECRET is not configured',
    unauthorizedMessage: 'Unauthorized cron request',
  })
  if (denied) return denied

  try {
    const locked = await withRedisLock('lock:system-plans-duplicate-merge', 240, async () => {
      return sweepDuplicateSystemPlans()
    })
    if (!locked.acquired) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'lock_held' })
    }
    return NextResponse.json({ ok: true, ...locked.result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Plan merge sweep failed' },
      { status: 500 },
    )
  }
}
