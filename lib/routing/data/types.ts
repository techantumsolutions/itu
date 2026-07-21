/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */

export type RoutingAuditDetail = {
  id: string
  distributor_ref: string
  internal_plan_id: string | null
  status: 'success' | 'failed'
  send_amount?: number | null
  user_currency?: string | null
  provider_cost?: number | null
  provider_currency?: string | null
  routing_decision: Record<string, unknown>
  attempts: Array<{
    providerName: string
    cost: number | null
    currency?: string | null
    source: 'RULE' | 'LCR'
    ok: boolean
    skipped?: boolean
    skipReason?: string
    error?: string
    errorCode?: string
    errorMessage?: string
  }>
}

export type RoutingAuditAttempt = RoutingAuditDetail['attempts'][number]

export type EvaluatedProviderAuditRow = {
  providerId?: string
  providerName?: string
  provider?: string
  costPrice?: number | null
  currency?: string | null
  margin?: number | null
  priority?: number | null
  eligibility?: boolean
  eligible?: boolean
  skipped?: boolean
  filterReason?: string | null
  reason?: string | null
  skipReason?: string | null
}
