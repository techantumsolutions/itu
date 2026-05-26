import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { syncProviderCatalog } from '@/lib/lcr/sync-catalog'
import { normalizeCountryList } from '@/lib/lcr/countries'
import { invalidatePublicCatalogCache } from '@/lib/catalog/invalidate-public-cache'

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
  if (!providerId) return NextResponse.json({ error: 'providerId is required' }, { status: 400 })

  const countries = normalizeCountryList(
    body.countries ?? body.countryIso3 ?? body.country ?? body.countryCode ?? '',
  )

  const result = await syncProviderCatalog(providerId, countries.length ? { countries } : undefined)

  await invalidatePublicCatalogCache().catch(() => {})

  return NextResponse.json({ success: true, result })
}
