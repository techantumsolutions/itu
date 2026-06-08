import { NextResponse } from 'next/server'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'
import { rateLimit } from '@/lib/security/rate-limit'
import { aggListSystemOperators } from '@/lib/aggregator/repository'
import { isMobileCatalogOperator } from '@/lib/catalog/mobile-catalog-filter'

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
  const limited = await rateLimit({ key: `rl:catalog:operators:${ip}`, limit: 120, windowSeconds: 60 })
  if (!limited.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { searchParams } = new URL(request.url)
  const country = (searchParams.get('country') ?? searchParams.get('countryCode') ?? '').trim().toUpperCase()
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Number(searchParams.get('limit') ?? '50')
  const offset = Number(searchParams.get('offset') ?? '0')
  const cacheKey = `aggregator:operators:${country || 'ALL'}:${q}:${limit}:${offset}`
  const cached = await cacheGetJson(cacheKey)
  if (cached) return NextResponse.json(cached)

  const rows = await aggListSystemOperators({
    country: country || undefined,
    q: q || undefined,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
    mobileCatalogOnly: true,
  })
  const telecomRows = rows.filter((row: any) => isMobileCatalogOperator(row))
  const payload = {
    operators: telecomRows.map((row: any) => ({
      id: row.id,
      name: row.system_operator_name,
      slug: row.slug,
      country: row.country_id,
      logo: row.logo,
      operatorType: row.operator_type,
      operatorDomain: row.operator_domain ?? 'MOBILE',
      status: row.status,
    })),
    pagination: {
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
      returned: telecomRows.length,
    },
  }
  await cacheSetJson(cacheKey, payload, 300)
  return NextResponse.json(payload)
}
