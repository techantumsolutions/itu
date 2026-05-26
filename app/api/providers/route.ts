import { NextResponse } from 'next/server'
import { guardCatalog } from '@/lib/db/require-catalog'
import { fetchPublicOperators } from '@/lib/catalog/public-catalog'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'

export async function GET(request: Request) {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const countryCode = searchParams.get('countryCode') ?? searchParams.get('country') ?? ''

    if (!countryCode.trim()) {
      return NextResponse.json({ error: 'Country code is required' }, { status: 400 })
    }

    const iso = countryCode.trim().toUpperCase()
    const cacheKey = `catalog:public:operators:${iso}`
    const cached = await cacheGetJson<{ providers: unknown[]; source: string }>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const rows = await fetchPublicOperators(iso)
    const payload = {
      source: 'database',
      providers: rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        shortName: p.shortName,
        logo: p.logo,
        countryCode: p.countryCode,
        countryIso3: p.countryIso3,
        validationRegex: p.validationRegex,
      })),
    }
    if (rows.length) await cacheSetJson(cacheKey, payload, 300)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('providers:', error)
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 })
  }
}
