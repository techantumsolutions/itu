import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

const PAGE_SIZE = 1000

async function fetchAllCountryRows(): Promise<{ country_iso3?: string }[]> {
  const all: { country_iso3?: string }[] = []
  let offset = 0
  while (true) {
    const res = await supabaseRest(
      `internal_plans?select=country_iso3&country_iso3=not.is.null&order=country_iso3.asc&limit=${PAGE_SIZE}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) break
    const rows = (await res.json()) as { country_iso3?: string }[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'products', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await fetchAllCountryRows()
  const counts = new Map<string, number>()
  for (const row of rows) {
    const iso = String(row.country_iso3 ?? '').trim().toUpperCase()
    if (!iso) continue
    counts.set(iso, (counts.get(iso) ?? 0) + 1)
  }

  const countries = [...counts.entries()]
    .map(([iso3, planCount]) => ({ iso3, planCount }))
    .sort((a, b) => a.iso3.localeCompare(b.iso3))

  return NextResponse.json({ countries })
}
