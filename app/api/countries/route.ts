import { NextResponse } from 'next/server'
import { guardCatalog } from '@/lib/db/require-catalog'
import { fetchPublicCountries } from '@/lib/catalog/public-catalog'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'

export async function GET() {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const cacheKey = 'catalog:public:countries'
    const cached = await cacheGetJson<{ countries: unknown[]; source: string }>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const rows = await fetchPublicCountries()
    const validCountries = rows.filter((c) => {
      if (!c.code) return false
      const cleanCode = c.code.trim().toUpperCase()
      // Only allow 2 or 3-letter codes, no digits, and exclude 'UNK'
      if (cleanCode.length < 2 || cleanCode.length > 3) return false
      if (/\d/.test(cleanCode)) return false
      if (cleanCode === 'UNK') return false
      return true
    })

    const payload = {
      source: 'database',
      countries: validCountries.map((c) => ({
        code: c.code,
        iso3: c.iso3,
        name: c.name,
        flag: c.flag,
        dialCode: c.dialCode,
        dialingInfo: [{ prefix: c.dialCode, minLength: 8, maxLength: 15 }],
      })),
    }
    if (rows.length) await cacheSetJson(cacheKey, payload, 300)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('countries:', error)
    return NextResponse.json({ error: 'Failed to fetch countries' }, { status: 500 })
  }
}
