/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import type { OperatorDomain } from '@/lib/aggregator/catalog-intelligence/types'

export const OPERATOR_DOMAINS: readonly OperatorDomain[] = [
  'MOBILE',
  'DTH',
  'UTILITY',
  'GAMING',
  'GIFTCARD',
  'RETAIL',
  'OTT',
  'TRAVEL',
  'FOOD',
  'BANKING',
  'WALLET',
  'UNKNOWN',
] as const

export function parseOperatorDomain(raw: string): OperatorDomain {
  const v = raw.trim().toUpperCase()
  for (const d of OPERATOR_DOMAINS) {
    if (d === v) return d
  }
  return 'UNKNOWN'
}

export function enc(v: string): string {
  return encodeURIComponent(v)
}

/** Columns guaranteed by supabase/uti_lcr_schema.sql */

export const LCR_PROVIDER_BASE_SELECT =
  'id,code,name,adapter_key,is_active,priority,base_url,refresh_interval_minutes,supported_countries,credentials_encrypted,status,last_sync_at,last_success_sync_at'

export async function jsonRows<T = any>(res: Response): Promise<T[]> {
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as T[]
}

export function isMissingAggregatorSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    message.includes('PGRST205') ||
    message.includes('schema cache') ||
    message.includes('Could not find the table') ||
    message.includes('provider_operator_raw') ||
    message.includes('system_operators') ||
    message.includes('system_plans') ||
    message.includes('plan_mappings') ||
    message.includes('sync_logs')
  )
}

export let aggregatorSchemaReady: boolean | null = null

/** True when multi_provider_aggregator_schema tables exist (positive result cached for process lifetime). */

export async function isAggregatorSchemaReady(): Promise<boolean> {
  if (aggregatorSchemaReady === true) return true
  try {
    const res = await supabaseRest('provider_operator_raw?select=id&limit=1', { cache: 'no-store' })
    if (res.ok) aggregatorSchemaReady = true
    return res.ok
  } catch {
    return false
  }
}

export async function jsonRowsOrEmpty<T = any>(res: Response): Promise<T[]> {
  try {
    return await jsonRows<T>(res)
  } catch (error) {
    if (isMissingAggregatorSchemaError(error)) return []
    throw error
  }
}
