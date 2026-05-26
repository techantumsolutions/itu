import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders, adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { aggListProviders } from '@/lib/aggregator/repository'
import { syncAggregatorProvider } from '@/lib/aggregator/sync-service'
import { enqueueProviderSync } from '@/lib/jobs/queue'

const syncSchema = z.object({
  providerId: z.string().uuid().optional(),
  mode: z.enum(['inline', 'queue']).optional(),
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

  const results: unknown[] = []
  for (const provider of providers) {
    if (parsed.data.mode === 'queue') {
      const job = await enqueueProviderSync(provider.id)
      results.push({ providerId: provider.id, queued: Boolean(job), jobId: job?.id ?? null })
    } else {
      const result = await syncAggregatorProvider(provider.id)
      results.push({ providerId: provider.id, result })
    }
  }
  return NextResponse.json({ success: true, results })
}
