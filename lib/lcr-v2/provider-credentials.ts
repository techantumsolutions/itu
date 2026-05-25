import type { ProviderAuth, ProviderConfig } from '@/lib/providers/types'

/** Parse JSON stored in `lcr_providers.credentials_encrypted` (plain JSON for now). */
export function parseCredentialsEncrypted(blob: string | null | undefined): ProviderAuth | undefined {
  if (!blob || typeof blob !== 'string') return undefined
  const t = blob.trim()
  if (!t) return undefined
  try {
    const j = JSON.parse(t) as Record<string, unknown>
    const apiKey = typeof j.apiKey === 'string' ? j.apiKey : undefined
    const apiSecret =
      typeof j.apiSecret === 'string' ? j.apiSecret : typeof j.api_secret === 'string' ? j.api_secret : undefined
    const clientId = typeof j.clientId === 'string' ? j.clientId : undefined
    const clientSecret = typeof j.clientSecret === 'string' ? j.clientSecret : undefined
    if (apiKey && apiSecret) return { kind: 'basic', apiKey, apiSecret, clientId, clientSecret }
    if (clientId && clientSecret) return { kind: 'custom', clientId, clientSecret }
    return undefined
  } catch {
    return undefined
  }
}

export function rowToProviderConfig(p: Record<string, unknown>): ProviderConfig {
  return {
    id: String(p.id),
    code: String(p.code),
    name: String(p.name),
    adapterKey: p.adapter_key as ProviderConfig['adapterKey'],
    isActive: Boolean(p.is_active),
    priority: Number(p.priority ?? 100),
    refreshIntervalMinutes: Number(p.refresh_interval_minutes ?? 60),
    supportedCountries: Array.isArray(p.supported_countries) ? (p.supported_countries as string[]) : [],
    baseUrl: p.base_url != null ? String(p.base_url) : undefined,
    auth: parseCredentialsEncrypted(
      typeof p.credentials_encrypted === 'string' ? p.credentials_encrypted : undefined,
    ),
  }
}
