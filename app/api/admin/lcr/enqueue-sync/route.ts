import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { enqueueProviderSync } from '@/lib/jobs/queue'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { logAdminActivity } from '@/lib/auth/audit'

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await adminCanManageProviders(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
  if (!providerId) return NextResponse.json({ error: 'providerId is required' }, { status: 400 })

  const job = await enqueueProviderSync(providerId)
  if (!job) {
    return NextResponse.json({ error: 'REDIS_URL not configured; cannot enqueue job' }, { status: 503 })
  }

  await logAdminActivity({
    action: 'Enqueue Provider Sync',
    pageName: 'Routing',
    details: { providerId, jobId: job.id },
  })

  return NextResponse.json({ success: true, jobId: job.id })
}
