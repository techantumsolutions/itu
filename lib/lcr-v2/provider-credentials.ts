import type { ProviderAdapterKey, ProviderAuth, ProviderConfig } from '@/lib/providers/types'
import { decryptProviderCredentials } from '@/lib/aggregator/credentials'

/** Map legacy/misconfigured registry rows to the implemented connector. */
export function resolveAdapterKey(code: string, adapterKey: string): ProviderAdapterKey {
  const key = adapterKey.trim().toLowerCase()
  if (key === 'custom' && code.trim().toUpperCase() === 'VALUETOPUP') return 'valuetopup'
  return key as ProviderAdapterKey
}

/** Decrypt and normalize credentials from `lcr_providers.credentials_encrypted`. */
export function parseCredentialsEncrypted(
  blob: string | null | undefined,
  context?: { providerId?: string },
): ProviderAuth | undefined {
  if (!blob || typeof blob !== 'string') return undefined
  const t = blob.trim()
  if (!t) return undefined

  const authObj = decryptProviderCredentials(t, context) as Record<string, unknown> | undefined
  if (!authObj) return undefined

  if (authObj && typeof authObj === 'object') {
    const apiKey = typeof authObj.apiKey === 'string' ? authObj.apiKey : undefined
    const apiSecret =
      typeof authObj.apiSecret === 'string' ? authObj.apiSecret : typeof authObj.api_secret === 'string' ? authObj.api_secret : undefined
    const clientId = typeof authObj.clientId === 'string' ? authObj.clientId : typeof authObj.client_id === 'string' ? authObj.client_id : undefined
    const clientSecret = typeof authObj.clientSecret === 'string' ? authObj.clientSecret : typeof authObj.client_secret === 'string' ? authObj.client_secret : undefined
    const token = typeof authObj.token === 'string' ? authObj.token : undefined
    
    if (apiKey && apiSecret) {
      return { kind: 'basic', apiKey, apiSecret, clientId, clientSecret, token }
    }
    if (apiKey) {
      return { kind: 'apiKey', apiKey, clientId, clientSecret, token }
    }
    if (clientId && clientSecret) {
      return { kind: 'custom', clientId, clientSecret, token }
    }
    if (token) {
      return { kind: 'bearer', token }
    }
    
    return {
      kind: authObj.kind || 'apiKey',
      apiKey,
      apiSecret,
      clientId,
      clientSecret,
      token,
    }
  }
  return undefined
}

export function rowToProviderConfig(p: Record<string, unknown>): ProviderConfig {
  return {
    id: String(p.id),
    code: String(p.code),
    name: String(p.name),
    adapterKey: resolveAdapterKey(String(p.code), String(p.adapter_key ?? '')),
    isActive: Boolean(p.is_active),
    priority: Number(p.priority ?? 100),
    refreshIntervalMinutes: Number(p.refresh_interval_minutes ?? 60),
    supportedCountries: Array.isArray(p.supported_countries) ? (p.supported_countries as string[]) : [],
    baseUrl: p.base_url != null ? String(p.base_url) : undefined,
    auth: parseCredentialsEncrypted(
      typeof p.credentials_encrypted === 'string' ? p.credentials_encrypted : undefined,
      { providerId: String(p.id) },
    ),
  }
}
