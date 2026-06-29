import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { listDomainOperatorRegistry } from '@/lib/aggregator/telecom-registry'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ operators: [], countries: [], configured: false, total: 0 })
  }

  const { searchParams } = new URL(request.url)
  const country = (searchParams.get('country') ?? '').trim().toUpperCase()
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Number(searchParams.get('limit') ?? '200')
  const offset = Number(searchParams.get('offset') ?? '0')
  const view = searchParams.get('view') === 'legacy' ? 'legacy' : 'domain'

  try {
    const [{ rows, total }, countriesRes] = await Promise.all([
      listDomainOperatorRegistry({
        country: country || undefined,
        q: q || undefined,
        limit: Number.isFinite(limit) ? limit : 200,
        offset: Number.isFinite(offset) ? offset : 0,
        table: view,
      }),
      supabaseRest(
        'domain_operator_registry?select=country_iso3&is_active=eq.true&domain=eq.MOBILE&limit=5000',
        { cache: 'no-store' },
      ).catch(() => null),
    ])

    const countryCounts = new Map<string, number>()
    if (countriesRes?.ok) {
      const countryRows = (await countriesRes.json()) as Array<{ country_iso3?: string }>
      for (const row of countryRows) {
        const iso3 = String(row.country_iso3 ?? '').toUpperCase()
        if (!iso3) continue
        countryCounts.set(iso3, (countryCounts.get(iso3) ?? 0) + 1)
      }
    }

    const countries = [...countryCounts.entries()]
      .map(([iso3, operatorCount]) => ({ iso3, operatorCount }))
      .sort((a, b) => a.iso3.localeCompare(b.iso3))

    const operators = rows.map((row) => ({
      ...row,
      aliases_json: Array.isArray(row.aliases_json) ? row.aliases_json : [],
    }))

    return NextResponse.json({
      configured: true,
      view,
      operators,
      total,
      countries,
      table: view === 'legacy' ? 'operator_domain_registry' : 'domain_operator_registry',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'registry_fetch_failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
