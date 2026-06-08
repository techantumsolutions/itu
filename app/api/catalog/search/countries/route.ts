import { NextResponse } from 'next/server'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'
import { rateLimit } from '@/lib/security/rate-limit'
import { aggListSystemOperators } from '@/lib/aggregator/repository'
import { isMobileCatalogOperator } from '@/lib/catalog/mobile-catalog-filter'

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
  const limited = await rateLimit({ key: `rl:catalog:country-search:${ip}`, limit: 120, windowSeconds: 60 })
  if (!limited.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { searchParams } = new URL(request.url)
  const country = (searchParams.get('country') ?? searchParams.get('q') ?? '').trim().toUpperCase()
  const cacheKey = `aggregator:country-search:${country || 'ALL'}`
  const cached = await cacheGetJson(cacheKey)
  if (cached) return NextResponse.json(cached)

  const rows = await aggListSystemOperators({ country: country || undefined, limit: 100, offset: 0, mobileCatalogOnly: true })
  const grouped = new Map<string, any[]>()
  for (const row of rows as any[]) {
    if (!isMobileCatalogOperator(row)) continue
    const key = row.country_id
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)?.push({
      id: row.id,
      name: row.system_operator_name,
      slug: row.slug,
      logo: row.logo,
      operatorType: row.operator_type,
    })
  }

  const payload = {
    countries: [...grouped.entries()].map(([countryCode, operators]) => ({
      countryCode,
      operators,
      operatorCount: operators.length,
    })),
  }
  await cacheSetJson(cacheKey, payload, 300)
  return NextResponse.json(payload)
}
