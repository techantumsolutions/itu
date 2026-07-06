import { NextResponse } from 'next/server'
import { cleanupPendingPaymentTransactions } from '@/lib/jobs/cleanup-pending-payment-transactions'
import { requireBearerSecret } from '@/lib/security/require-secret'

export async function POST(request: Request) {
  const denied = requireBearerSecret(request, 'CRON_SECRET', {
    missingMessage: 'CRON_SECRET is not configured',
    unauthorizedMessage: 'Unauthorized cron request',
  })
  if (denied) return denied

  try {
    const result = await cleanupPendingPaymentTransactions(24)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Cleanup failed' },
      { status: 500 },
    )
  }
}
