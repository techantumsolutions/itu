/** Human-readable routing type for admin / transaction detail views. */
import { supabaseRest } from '@/lib/db/supabase-rest'

export function formatRoutingType(value: string | null | undefined): string {
  const v = (value ?? '').trim().toUpperCase()
  if (!v) return '—'
  if (v === 'RULE') return 'Routing Rule'
  if (v === 'LCR') return 'LCR (Least Cost)'
  if (v === 'ROUTING_RULE') return 'Routing Rule'
  if (v === 'LEAST_COST' || v === 'LEAST_COST_SELECTED') return 'LCR (Least Cost)'
  return value.trim()
}

export function resolveRoutingTypeLabel(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return '—'

  const direct = metadata.routing_type ?? metadata.routingType
  if (typeof direct === 'string' && direct.trim()) {
    return formatRoutingType(direct)
  }

  const routingResult = metadata.routing_result
  if (routingResult && typeof routingResult === 'object') {
    const rr = routingResult as Record<string, unknown>
    if (rr.routing_rule_matched === true) return 'Routing Rule'
    if (rr.routing_rule_matched === false) return 'LCR (Least Cost)'
    const nested = rr.routingType ?? rr.routing_type
    if (typeof nested === 'string' && nested.trim()) {
      return formatRoutingType(nested)
    }
  }

  const lcrResult = metadata.lcr_result
  if (lcrResult && typeof lcrResult === 'object') {
    const nested = (lcrResult as Record<string, unknown>).routingType
    if (typeof nested === 'string' && nested.trim()) {
      return formatRoutingType(nested)
    }
  }

  if (metadata.routing_rule_matched === true) return 'Routing Rule'
  if (metadata.routing_rule_matched === false) return 'LCR (Least Cost)'

  return '—'
}

/** First routing log entry per transaction (initial routing decision). */
export async function fetchRoutingTypesFromLogs(transactionIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (transactionIds.length === 0) return map

  const chunkSize = 80
  for (let i = 0; i < transactionIds.length; i += chunkSize) {
    const chunk = transactionIds.slice(i, i + chunkSize)
    const res = await supabaseRest(
      `routing_logs?transaction_id=in.(${chunk.map(encodeURIComponent).join(',')})&select=transaction_id,routing_type,created_at&order=created_at.asc`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue

    const logs = (await res.json()) as Array<{
      transaction_id: string
      routing_type: string | null
      created_at: string
    }>

    for (const log of logs) {
      if (!log.transaction_id || map.has(log.transaction_id)) continue
      const routingType = log.routing_type?.trim()
      if (routingType) map.set(log.transaction_id, routingType)
    }
  }

  return map
}
