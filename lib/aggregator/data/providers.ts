/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import type {
  AggregatorProviderRow,
  RawOperatorInput,
  RawPlanInput,
  SystemOperatorInput,
  SystemPlanInput,
} from '@/lib/aggregator/types'
import { LCR_PROVIDER_BASE_SELECT, enc, jsonRows } from './shared'

export async function aggListProviders(): Promise<AggregatorProviderRow[]> {
  const res = await supabaseRest(`lcr_providers?select=${LCR_PROVIDER_BASE_SELECT}&order=priority.asc`, {
    cache: 'no-store',
  })
  return jsonRows<AggregatorProviderRow>(res)
}

export async function aggGetProvider(providerId: string): Promise<AggregatorProviderRow | null> {
  const res = await supabaseRest(
    `lcr_providers?id=eq.${enc(providerId)}&select=${LCR_PROVIDER_BASE_SELECT}&limit=1`,
    { cache: 'no-store' },
  )
  const rows = await jsonRows<AggregatorProviderRow>(res)
  const row = rows[0] ?? null
  if (row?.credentials_encrypted) {
    const { reencryptPlaintextCredentialsAtRest } = await import('@/lib/aggregator/credentials')
    const updated = await reencryptPlaintextCredentialsAtRest(providerId, row.credentials_encrypted)
    if (updated) row.credentials_encrypted = updated
  }
  return row
}

export async function aggPatchProvider(providerId: string, patch: Record<string, unknown>) {
  const res = await supabaseRest(`lcr_providers?id=eq.${enc(providerId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  const rows = await jsonRows(res)
  return rows[0] ?? null
}
