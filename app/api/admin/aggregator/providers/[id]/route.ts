import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders, adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { aggAudit, aggGetProvider, aggPatchProvider } from '@/lib/aggregator/repository'
import { encryptProviderCredentials } from '@/lib/aggregator/credentials'
import { slugify } from '@/lib/aggregator/signature'
import { getRequestUser } from '@/lib/tickets/auth-headers'

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  adapterKey: z.enum(['dtone', 'ding', 'reloadly', 'valuetopup', 'custom']).optional(),
  providerType: z.string().optional(),
  authType: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal('')),
  priority: z.number().int().min(1).max(9999).optional(),
  isActive: z.boolean().optional(),
  syncFrequency: z.string().optional(),
  refreshIntervalMinutes: z.number().int().min(5).max(10080).optional(),
  supportedCountries: z.array(z.string()).optional(),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  credentials: z.record(z.unknown()).optional(),
})

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const provider = await aggGetProvider(id)
  if (!provider) return NextResponse.json({ error: 'provider_not_found' }, { status: 404 })
  const { credentials_encrypted: _secret, ...safe } = provider
  return NextResponse.json({ provider: safe })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminCanManageProviders(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const before = await aggGetProvider(id)
  if (!before) return NextResponse.json({ error: 'provider_not_found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid provider payload', issues: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data
  const patch: Record<string, unknown> = {}
  if (input.name != null) {
    patch.name = input.name.trim()
    patch.slug = slugify(input.name)
  }
  if (input.adapterKey != null) patch.adapter_key = input.adapterKey
  if (input.providerType != null) patch.provider_type = input.providerType
  if (input.authType != null) patch.auth_type = input.authType
  if (input.baseUrl != null) patch.base_url = input.baseUrl || null
  if (input.priority != null) patch.priority = input.priority
  if (input.isActive != null) patch.is_active = input.isActive
  if (input.syncFrequency != null) patch.sync_frequency = input.syncFrequency
  if (input.refreshIntervalMinutes != null) patch.refresh_interval_minutes = input.refreshIntervalMinutes
  if (input.supportedCountries != null) patch.supported_countries = input.supportedCountries
  if (input.webhookUrl != null) patch.webhook_url = input.webhookUrl || null
  if (input.credentials) patch.credentials_encrypted = encryptProviderCredentials(input.credentials)

  const provider = await aggPatchProvider(id, patch)
  const actor = getRequestUser(request)
  await aggAudit({ actor: actor?.email, action: 'provider.update', entityType: 'lcr_provider', entityId: id, before, after: provider })
  if (provider) delete provider.credentials_encrypted
  return NextResponse.json({ provider })
}
