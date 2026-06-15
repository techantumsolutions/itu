import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders, adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { aggAudit, aggListProviders } from '@/lib/aggregator/repository'
import { encryptProviderCredentials } from '@/lib/aggregator/credentials'
import { slugify } from '@/lib/aggregator/signature'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { logAdminActivity } from '@/lib/auth/audit'

const providerSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  adapterKey: z.enum(['dtone', 'ding', 'reloadly', 'valuetopup', 'custom']),
  providerType: z.string().optional(),
  authType: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal('')),
  priority: z.number().int().min(1).max(9999).optional(),
  syncFrequency: z.string().optional(),
  refreshIntervalMinutes: z.number().int().min(5).max(10080).optional(),
  supportedCountries: z.array(z.string()).optional(),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  credentials: z.record(z.unknown()).optional(),
})

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) return NextResponse.json({ providers: [], configured: false })
  const providers = await aggListProviders()
  return NextResponse.json({
    configured: true,
    providers: providers.map(({ credentials_encrypted: _secret, ...provider }) => provider),
  })
}

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!isSupabaseCatalogConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const body = await request.json().catch(() => ({}))
  const parsed = providerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid provider payload', issues: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data
  const code = input.code.trim().toUpperCase()
  const credentialsEncrypted = input.credentials ? encryptProviderCredentials(input.credentials) : null
  const res = await supabaseRest('lcr_providers', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      code,
      name: input.name.trim(),
      adapter_key: input.adapterKey,
      provider_type: input.providerType ?? 'aggregator',
      auth_type: input.authType ?? 'custom',
      is_active: true,
      priority: input.priority ?? 100,
      base_url: input.baseUrl || null,
      slug: slugify(input.name),
      sync_frequency: input.syncFrequency ?? 'daily',
      refresh_interval_minutes: input.refreshIntervalMinutes ?? 1440,
      supported_countries: input.supportedCountries ?? [],
      webhook_url: input.webhookUrl || null,
      credentials_encrypted: credentialsEncrypted,
    }),
  })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const rows = (await res.json()) as any[]
  const provider = rows[0] ?? null
  const actor = getRequestUser(request)
  await aggAudit({ actor: actor?.email, action: 'provider.create', entityType: 'lcr_provider', entityId: provider?.id, after: provider })
  if (provider) delete provider.credentials_encrypted

  await logAdminActivity({
    action: 'Create Aggregator Provider',
    pageName: 'Integrations',
    details: {
      code,
      name: input.name,
      adapterKey: input.adapterKey,
    },
  })

  return NextResponse.json({ provider }, { status: 201 })
}
