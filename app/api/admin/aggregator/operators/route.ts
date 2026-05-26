import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import { aggListRawOperators, aggListSystemOperators } from '@/lib/aggregator/repository'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) return NextResponse.json({ rawOperators: [], systemOperators: [], configured: false })

  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') ?? '50')
  const offset = Number(searchParams.get('offset') ?? '0')
  const country = (searchParams.get('country') ?? '').trim().toUpperCase()
  const providerId = (searchParams.get('providerId') ?? '').trim()
  const q = (searchParams.get('q') ?? '').trim()

  const [rawOperators, systemOperators] = await Promise.all([
    aggListRawOperators({
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
      country: country || undefined,
      providerId: providerId || undefined,
    }),
    aggListSystemOperators({
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
      country: country || undefined,
      q: q || undefined,
    }),
  ])

  return NextResponse.json({ configured: true, rawOperators, systemOperators })
}
