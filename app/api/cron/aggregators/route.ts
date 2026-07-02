import { NextResponse } from 'next/server'
import { requireBearerSecret } from '@/lib/security/require-secret'
import { isInRefreshWindow, refreshAggregatorData } from '@/lib/api/lcr-engine'

export async function POST(request: Request) {
  const denied = requireBearerSecret(request, 'CRON_SECRET', {
    missingMessage: 'CRON_SECRET is not configured',
    unauthorizedMessage: 'Unauthorized cron request',
  })
  if (denied) return denied

  const now = new Date()
  const inWindow = isInRefreshWindow(now)

  try {
    const run = await refreshAggregatorData({ source: 'scheduled', maxAttempts: 3 })
    return NextResponse.json({
      run,
      inScheduledWindow: inWindow,
      scheduledWindow: '01:00-03:00 server time',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scheduled refresh failed' },
      { status: 500 },
    )
  }
}
