import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { listRoutingLogs } from '@/lib/routing/repository'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const countryId = url.searchParams.get('countryId') ?? undefined
  const operatorId = url.searchParams.get('operatorId') ?? undefined
  const providerId = url.searchParams.get('providerId') ?? undefined
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0))

  const { logs, total } = await listRoutingLogs({
    countryId,
    operatorId,
    providerId,
    from,
    to,
    limit,
    offset,
  })

  return NextResponse.json({ logs, total, limit, offset })
}
