import { parseCredentialsEncrypted } from '@/lib/lcr-v2/provider-credentials'

export type ProviderPayloadStrategy =
  | 'WHOLESALE_AMOUNT'
  | 'FACE_VALUE'
  | 'PLAN_ID'
  | 'SKU'
  | 'DENOMINATION'

const STRATEGY_VALUES = new Set<ProviderPayloadStrategy>([
  'WHOLESALE_AMOUNT',
  'FACE_VALUE',
  'PLAN_ID',
  'SKU',
  'DENOMINATION',
])

/** Default strategy per adapter when not set on provider row (credentials JSON). */
const DEFAULT_STRATEGY_BY_ADAPTER: Record<string, ProviderPayloadStrategy> = {
  ding: 'WHOLESALE_AMOUNT',
  valuetopup: 'FACE_VALUE',
  dtone: 'PLAN_ID',
}

function readStrategyFromCredentials(blob: unknown): ProviderPayloadStrategy | null {
  if (!blob || typeof blob !== 'object') return null
  const obj = blob as Record<string, unknown>
  const direct = obj.provider_payload_strategy ?? obj.providerPayloadStrategy
  if (typeof direct === 'string' && STRATEGY_VALUES.has(direct as ProviderPayloadStrategy)) {
    return direct as ProviderPayloadStrategy
  }
  const extra = obj.extra as Record<string, unknown> | undefined
  const nested = extra?.provider_payload_strategy ?? extra?.providerPayloadStrategy
  if (typeof nested === 'string' && STRATEGY_VALUES.has(nested as ProviderPayloadStrategy)) {
    return nested as ProviderPayloadStrategy
  }
  return null
}

/** Resolve payload strategy from lcr_providers row (credentials_encrypted JSON field). */
export function resolveProviderPayloadStrategy(providerRow: Record<string, unknown>): ProviderPayloadStrategy {
  const credBlob =
    typeof providerRow.credentials_encrypted === 'string'
      ? providerRow.credentials_encrypted
      : undefined
  const auth = parseCredentialsEncrypted(credBlob, {
    providerId: typeof providerRow.id === 'string' ? providerRow.id : undefined,
  })
  const fromAuth = readStrategyFromCredentials(auth)
  if (fromAuth) return fromAuth

  const adapter = String(providerRow.adapter_key ?? '').trim().toLowerCase()
  if (adapter && DEFAULT_STRATEGY_BY_ADAPTER[adapter]) {
    return DEFAULT_STRATEGY_BY_ADAPTER[adapter]
  }

  const code = String(providerRow.code ?? '').trim().toLowerCase()
  if (code && DEFAULT_STRATEGY_BY_ADAPTER[code]) {
    return DEFAULT_STRATEGY_BY_ADAPTER[code]
  }

  return 'PLAN_ID'
}

export function isProviderPayloadStrategy(value: unknown): value is ProviderPayloadStrategy {
  return typeof value === 'string' && STRATEGY_VALUES.has(value as ProviderPayloadStrategy)
}
