import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders, adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { aggListProviders } from '@/lib/aggregator/repository'
import { syncProviderCatalog } from '@/lib/lcr/sync-catalog'
import { enqueueProviderSync } from '@/lib/jobs/queue'
import { invalidatePublicCatalogCache } from '@/lib/catalog/invalidate-public-cache'
import { logAdminActivity } from '@/lib/auth/audit'

import { normalizeCountryList } from '@/lib/lcr/countries'

const syncSchema = z.object({
  providerId: z.string().uuid().optional(),
  mode: z.enum(['inline', 'queue']).optional(),
  countryIso3: z.string().optional(),
  countries: z.array(z.string()).optional(),
  country: z.string().optional(),
})

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const providers = await aggListProviders()
  return NextResponse.json({
    providers: providers.map(({ credentials_encrypted: _secret, ...p }) => p),
  })
}

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid sync payload', issues: parsed.error.flatten() }, { status: 400 })

  const providers = parsed.data.providerId
    ? [{ id: parsed.data.providerId }]
    : (await aggListProviders()).filter((p) => p.is_active).map((p) => ({ id: p.id }))

  const countries = normalizeCountryList(
    parsed.data.countries ?? parsed.data.countryIso3 ?? parsed.data.country ?? '',
  )
  const syncOptions = countries.length ? { countries } : undefined

  const results: unknown[] = []
  for (const provider of providers) {
    if (parsed.data.mode === 'queue') {
      const job = await enqueueProviderSync(provider.id)
      results.push({ providerId: provider.id, queued: Boolean(job), jobId: job?.id ?? null })
    } else {
      const result = await syncProviderCatalog(provider.id, syncOptions)
      results.push({ providerId: provider.id, result })
    }
  }
  if (parsed.data.mode !== 'queue') {
    await invalidatePublicCatalogCache().catch(() => {})
  }

  await logAdminActivity({
    action: 'Sync Aggregator Providers',
    pageName: 'Integrations',
    details: {
      providerId: parsed.data.providerId,
      mode: parsed.data.mode,
      countries,
      results,
    },
  })

  return NextResponse.json({ success: true, results })
}
