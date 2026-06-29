import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { aggListSyncLogs } from '@/lib/aggregator/repository'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const providerId = (searchParams.get('providerId') ?? '').trim()
  const limit = Number(searchParams.get('limit') ?? '50')
  const offset = Number(searchParams.get('offset') ?? '0')
  const logs = await aggListSyncLogs({
    providerId: providerId || undefined,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  })
  return NextResponse.json({ logs })
}
