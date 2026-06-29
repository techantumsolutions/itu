import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { syncProviderCatalog } from '@/lib/lcr/sync-catalog'
import { normalizeCountryList } from '@/lib/lcr/countries'
import { invalidatePublicCatalogCache } from '@/lib/catalog/invalidate-public-cache'
import { logAdminActivity } from '@/lib/auth/audit'

export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'providers.sync')
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
  if (!providerId) return NextResponse.json({ error: 'providerId is required' }, { status: 400 })

  const countries = normalizeCountryList(
    body.countries ?? body.countryIso3 ?? body.country ?? body.countryCode ?? '',
  )

  try {
    const result = await syncProviderCatalog(providerId, countries.length ? { countries } : undefined)
    await invalidatePublicCatalogCache().catch(() => {})

    await logAdminActivity({
      action: 'Sync Provider Catalog',
      pageName: 'Routing',
      details: { providerId, countries },
    })

    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync_failed'
    console.error('[lcr/sync]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
