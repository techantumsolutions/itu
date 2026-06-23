import { NextResponse } from 'next/server'
import { guardCatalog } from '@/lib/db/require-catalog'
import { fetchPublicPlans } from '@/lib/catalog/public-catalog'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'

export async function GET(request: Request) {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const countryId = (
      searchParams.get('countryId') ??
      searchParams.get('country') ??
      searchParams.get('countryCode') ??
      'IN'
    ).trim()
    const operatorId = (
      searchParams.get('operatorId') ??
      searchParams.get('providerCode') ??
      searchParams.get('operator') ??
      ''
    ).trim()
    const operatorName = (searchParams.get('operatorName') ?? '').trim()
    const search = (searchParams.get('search') ?? searchParams.get('q') ?? '').trim()
    const category = (searchParams.get('category') ?? '').trim()
    const limit = Number(searchParams.get('limit') ?? '200')

    if (!operatorId && !operatorName) {
      return NextResponse.json({ error: 'operatorId or operatorName is required' }, { status: 400 })
    }

    const cacheKey = `catalog:public:plans:${normalizeCountryIso3(countryId)}:${operatorId}:${operatorName}:${search}:${category}:${limit}`
    const cached = await cacheGetJson<{ plans: unknown[]; source: string }>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const rows = await fetchPublicPlans({
      countryId,
      operatorId: operatorId || undefined,
      operatorName: operatorName || undefined,
      search: search || undefined,
      category: category || undefined,
      limit,
    })

    const payload = {
      source: 'database',
      plans: rows.map((p) => ({
        id: p.id,
        internalPlanId: p.internalPlanId ?? p.id,
        systemPlanId: p.systemPlanId,
        price_inr: p.price_inr,
        price_eur: p.price_eur,
        recharge_amount: p.recharge_amount,
        recharge_currency: p.recharge_currency,
        validity: p.validity,
        data: p.data,
        benefits: p.benefits,
        tag: p.tag,
        type: p.type,
        planName: p.planName,
      })),
    }
    if (rows.length) await cacheSetJson(cacheKey, payload, 300)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('plans:', error)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
