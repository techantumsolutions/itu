import { NextResponse } from 'next/server'
import { dbFetchOperators } from '@/lib/db/catalog'
import { guardCatalog } from '@/lib/db/require-catalog'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'

export async function GET(request: Request) {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const countryCode = searchParams.get('countryCode')

    if (!countryCode) {
      return NextResponse.json({ error: 'Country code is required' }, { status: 400 })
    }

    const iso = countryCode.trim().toUpperCase()
    const cacheKey = `catalog:operators:${iso}`
    const cached = await cacheGetJson<any[]>(cacheKey)
    const rows = cached ?? (await dbFetchOperators(iso))
    if (!cached && rows.length) await cacheSetJson(cacheKey, rows, 300)

    const providers = rows.map((p) => ({
      id: `carrier-${p.code.toLowerCase().replace(/_/g, '-')}`,
      code: p.code,
      name: p.name,
      shortName: p.short_name ?? p.name,
      logo: p.logo_url,
      countryCode: p.country_iso,
      validationRegex: p.validation_regex,
      regionCode: p.region_code,
    }))

    return NextResponse.json({ providers })
  } catch (error) {
    console.error('providers:', error)
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 })
  }
}
