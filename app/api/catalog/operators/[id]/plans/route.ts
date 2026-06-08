import { NextResponse } from 'next/server'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'
import { rateLimit } from '@/lib/security/rate-limit'
import { aggListSystemPlans } from '@/lib/aggregator/repository'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
  const limited = await rateLimit({ key: `rl:catalog:operator-plans:${ip}`, limit: 120, windowSeconds: 60 })
  if (!limited.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Number(searchParams.get('limit') ?? '50')
  const offset = Number(searchParams.get('offset') ?? '0')
  const cacheKey = `aggregator:operator:${id}:plans:${q}:${limit}:${offset}`
  const cached = await cacheGetJson(cacheKey)
  if (cached) return NextResponse.json(cached)

  const rows = await aggListSystemPlans({
    systemOperatorId: id,
    q: q || undefined,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
    mobileCatalogOnly: true,
  })
  const payload = {
    plans: rows.map((row: any) => ({
      id: row.id,
      operatorId: row.system_operator_id,
      name: row.system_plan_name,
      slug: row.slug,
      amount: row.amount,
      currency: row.currency,
      validity: row.validity,
      talktime: row.talktime,
      dataVolume: row.data_volume,
      sms: row.sms,
      planType: row.plan_type,
      description: row.description,
      status: row.status,
    })),
    pagination: { limit: Number.isFinite(limit) ? limit : 50, offset: Number.isFinite(offset) ? offset : 0, returned: rows.length },
  }
  await cacheSetJson(cacheKey, payload, 300)
  return NextResponse.json(payload)
}
