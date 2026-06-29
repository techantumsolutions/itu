import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { getQueueSnapshot } from '@/lib/jobs/queue'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const snapshot = await getQueueSnapshot()
  return NextResponse.json({
    cron: {
      endpoint: '/api/cron/lcr-v2-sync',
      schedule: 'daily',
      requiresSecret: Boolean(process.env.CRON_SECRET),
    },
    queues: snapshot,
  })
}
