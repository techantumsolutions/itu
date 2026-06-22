import { NextResponse } from 'next/server'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'
import { rateLimit } from '@/lib/security/rate-limit'
import { aggListSystemPlans } from '@/lib/aggregator/repository'
import { isMobileCatalogPlan } from '@/lib/catalog/mobile-catalog-filter'
import { filterWebsiteEligibleSystemPlans } from '@/lib/catalog/website-plan-eligibility'

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
  const limited = await rateLimit({ key: `rl:catalog:plans:${ip}`, limit: 120, windowSeconds: 60 })
  if (!limited.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { searchParams } = new URL(request.url)
  const operatorId = (searchParams.get('operatorId') ?? '').trim()
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Number(searchParams.get('limit') ?? '50')
  const offset = Number(searchParams.get('offset') ?? '0')
  const cacheKey = `aggregator:plans:${operatorId || 'ALL'}:${q}:${limit}:${offset}`
  const cached = await cacheGetJson(cacheKey)
  if (cached) return NextResponse.json(cached)

  const rows = await aggListSystemPlans({
    systemOperatorId: operatorId || undefined,
    q: q || undefined,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
    mobileCatalogOnly: true,
  })
  const activeMobilePlans = rows.filter((row: { status?: string; service_domain?: string }) =>
    isMobileCatalogPlan(row),
  )
  const eligibleRows = operatorId
    ? await filterWebsiteEligibleSystemPlans(activeMobilePlans, operatorId)
    : activeMobilePlans
  const payload = {
    plans: eligibleRows.map((row: any) => ({
      id: row.id,
      operatorId: row.system_operator_id,
      name: row.system_plan_name,
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
    pagination: { limit: Number.isFinite(limit) ? limit : 50, offset: Number.isFinite(offset) ? offset : 0, returned: eligibleRows.length },
  }
  await cacheSetJson(cacheKey, payload, 300)
  return NextResponse.json(payload)
}
