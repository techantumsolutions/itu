import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { getProviderSyncQueue } from '@/lib/jobs/queue'

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
  if (!providerId) return NextResponse.json({ error: 'providerId is required' }, { status: 400 })

  const q = getProviderSyncQueue()
  if (!q) {
    return NextResponse.json({ error: 'REDIS_URL not configured; cannot enqueue job' }, { status: 503 })
  }

  const job = await q.add('sync', { providerId }, { removeOnComplete: 100, removeOnFail: 50 })
  return NextResponse.json({ success: true, jobId: job.id })
}
