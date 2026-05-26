import { NextResponse } from 'next/server'
import { guardCatalog } from '@/lib/db/require-catalog'
import { fetchPublicOperatorCounts, fetchPublicCountries } from '@/lib/catalog/public-catalog'

const MAX_CODES = 40

/**
 * GET ?codes=JM,NG,IN — operator counts from synced catalog (database).
 * When no codes provided, returns counts for all countries with catalog data.
 */
export async function GET(request: Request) {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const raw = searchParams.get('codes') ?? ''
    const parsed = raw
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2,3}$/.test(c))

    const allCounts = await fetchPublicOperatorCounts()

    if (!parsed.length) {
      return NextResponse.json({ source: 'database', counts: allCounts })
    }

    const unique = [...new Set(parsed)].slice(0, MAX_CODES)
    const counts: Record<string, number> = {}
    for (const code of unique) {
      counts[code] = allCounts[code] ?? 0
    }

    if (Object.values(counts).every((n) => n === 0)) {
      const countries = await fetchPublicCountries()
      for (const code of unique) {
        const match = countries.find((c) => c.code === code || c.iso3 === code)
        counts[code] = match?.operatorCount ?? 0
      }
    }

    return NextResponse.json({ source: 'database', counts })
  } catch (error) {
    console.error('operator-counts:', error)
    return NextResponse.json({ error: 'Failed to load operator counts' }, { status: 500 })
  }
}
