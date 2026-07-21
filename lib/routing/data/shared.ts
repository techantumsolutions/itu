/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { mergeRoutingLogPricing, parseRoutingLogStatus, formatProviderCostDual } from '@/lib/routing/log-pricing'
import type {
  LcrEngineSettings,
  ProviderPriorityRow,
  RoutingLogRow,
  RoutingRuleRow,
  RoutingStrategy,
  FallbackStrategy,
} from '@/lib/routing/types'

export function enc(v: string): string {
  return encodeURIComponent(v)
}

/** system_plan_id from recharge attempt routing_decision or routing log status JSON. */

export function routingLogSystemPlanId(
  attempt?: { routing_decision?: unknown } | null,
  status?: string | null,
): string | null {
  const rd = attempt?.routing_decision
  if (rd && typeof rd === 'object' && !Array.isArray(rd)) {
    const id = (rd as Record<string, unknown>).system_plan_id
    if (typeof id === 'string' && id.trim()) return id.trim()
  }
  if (!status) return null
  const meta = parseRoutingLogStatus(status)
  const id = meta.system_plan_id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

export let schemaReadyCache: boolean | null = null

export let schemaReadyCheckedAt = 0

export async function isRoutingEngineSchemaReady(): Promise<boolean> {
  const now = Date.now()
  if (schemaReadyCache != null && now - schemaReadyCheckedAt < 30_000) return schemaReadyCache
  const res = await supabaseRest('lcr_engine_settings?select=id&limit=1', { cache: 'no-store' })
  schemaReadyCache = res.ok
  schemaReadyCheckedAt = now
  return schemaReadyCache
}

export function mapSettings(row: Record<string, unknown>): LcrEngineSettings {
  return {
    id: String(row.id),
    enabled: Boolean(row.enabled),
    routingStrategy: String(row.routing_strategy ?? 'LEAST_COST') as RoutingStrategy,
    fallbackStrategy: String(row.fallback_strategy ?? 'NEXT_PROVIDER') as FallbackStrategy,
    autoFailover: Boolean(row.auto_failover),
    retryEnabled: Boolean(row.retry_enabled),
    retryAttempts: Number(row.retry_attempts ?? 2),
  }
}

export const SYSTEM_OPERATOR_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Parse routing_logs.operator_id (`system:{uuid}`, bare uuid, or slug/name). */

export function parseRoutingLogOperatorRef(operatorId: string | null | undefined): {
  uuid: string | null
  raw: string | null
} {
  if (!operatorId?.trim()) return { uuid: null, raw: null }
  const trimmed = operatorId.trim()
  const withoutPrefix = trimmed.toLowerCase().startsWith('system:') ? trimmed.slice(7) : trimmed
  if (SYSTEM_OPERATOR_UUID_RE.test(withoutPrefix)) {
    return { uuid: withoutPrefix, raw: trimmed }
  }
  return { uuid: null, raw: withoutPrefix }
}
