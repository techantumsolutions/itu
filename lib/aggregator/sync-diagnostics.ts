import type { SkippedOperatorReason } from '@/lib/aggregator/operator-classifier'

export type SyncStage =
  | 'ding_api_fetch'
  | 'normalization'
  | 'raw_operator_store'
  | 'operator_classification'
  | 'system_operator_create'
  | 'operator_mapping'
  | 'plan_mapping'
  | 'public_catalog'

export type OperatorDecisionLog = {
  providerOperatorId: string
  providerOperatorName: string
  countryIso3: string
  decision: 'ACCEPTED' | 'REJECTED' | 'RESOLVED'
  reason?: SkippedOperatorReason | string
  resolvedName?: string
  confidence?: number
}

export type CountryMappingLog = {
  providerCountry: string
  resolvedIso3: string
  success: boolean
}

export type SyncPipelineDiagnostics = {
  providerCode: string
  providerId: string
  stages: Record<
    SyncStage,
    {
      recordsReceived: number
      recordsStored: number
      recordsFiltered: number
      recordsMapped: number
      recordsRejected: number
      notes?: string[]
    }
  >
  countryMappings: CountryMappingLog[]
  operatorDecisions: OperatorDecisionLog[]
  uniqueRawOperatorIds: Set<string>
}

export function createSyncDiagnostics(providerId: string, providerCode: string): SyncPipelineDiagnostics {
  const empty = () => ({
    recordsReceived: 0,
    recordsStored: 0,
    recordsFiltered: 0,
    recordsMapped: 0,
    recordsRejected: 0,
    notes: [] as string[],
  })
  return {
    providerId,
    providerCode,
    stages: {
      ding_api_fetch: empty(),
      normalization: empty(),
      raw_operator_store: empty(),
      operator_classification: empty(),
      system_operator_create: empty(),
      operator_mapping: empty(),
      plan_mapping: empty(),
      public_catalog: empty(),
    },
    countryMappings: [],
    operatorDecisions: [],
    uniqueRawOperatorIds: new Set(),
  }
}

export function logCountryMapping(
  diag: SyncPipelineDiagnostics,
  providerCountry: string,
  resolvedIso3: string,
): void {
  const success = Boolean(resolvedIso3)
  diag.countryMappings.push({ providerCountry, resolvedIso3, success })
  if (process.env.SYNC_VERBOSE === 'true') {
    console.log(
      `[Sync Diagnostics] Country Mapping — Provider: ${providerCountry} | Resolved: ${resolvedIso3 || 'null'} | Success: ${success}`,
    )
  }
}

export function logOperatorDecision(diag: SyncPipelineDiagnostics, entry: OperatorDecisionLog): void {
  diag.operatorDecisions.push(entry)
  const reason = entry.reason ? ` | Reason: ${entry.reason}` : ''
  const resolved = entry.resolvedName ? ` | Resolved: ${entry.resolvedName}` : ''
  if (process.env.SYNC_VERBOSE === 'true') {
    console.log(
      `[Sync Diagnostics] Operator Candidate — Name: ${entry.providerOperatorName} | Decision: ${entry.decision}${reason}${resolved}`,
    )
  }
}

export function summarizeDiagnostics(diag: SyncPipelineDiagnostics) {
  const uniqueOperators = diag.uniqueRawOperatorIds.size
  return {
    providerId: diag.providerId,
    providerCode: diag.providerCode,
    stages: diag.stages,
    uniqueRawOperators: uniqueOperators,
    countryMappingFailures: diag.countryMappings.filter((c) => !c.success).length,
    operatorDecisionsSample: diag.operatorDecisions.slice(0, 50),
    operatorAccepted: diag.operatorDecisions.filter((d) => d.decision === 'ACCEPTED' || d.decision === 'RESOLVED').length,
    operatorRejected: diag.operatorDecisions.filter((d) => d.decision === 'REJECTED').length,
  }
}

export function printPipelineReport(diag: SyncPipelineDiagnostics): void {
  const s = diag.stages
  //   console.log(`
  // [Sync Diagnostics] Pipeline Report — ${diag.providerCode}
  // ────────────────────────────────────────
  // 1. Ding API / Fetch     received=${s.ding_api_fetch.recordsReceived} stored=${s.ding_api_fetch.recordsStored}
  // 2. Normalization        received=${s.normalization.recordsReceived} stored=${s.normalization.recordsStored} filtered=${s.normalization.recordsFiltered}
  // 3. Raw Operators        stored=${s.raw_operator_store.recordsStored} unique=${diag.uniqueRawOperatorIds.size} rejected=${s.raw_operator_store.recordsRejected}
  // 4. Classification       received=${s.operator_classification.recordsReceived} rejected=${s.operator_classification.recordsRejected}
  // 5. System Operators     created=${s.system_operator_create.recordsStored}
  // 6. Operator Mappings    created=${s.operator_mapping.recordsMapped}
  // 7. Plan Mappings        mapped=${s.plan_mapping.recordsMapped}
  // ────────────────────────────────────────
  // Country mappings: ${diag.countryMappings.length} (${diag.countryMappings.filter((c) => !c.success).length} failed)
  // Operator decisions: ${diag.operatorDecisions.filter((d) => d.decision === 'ACCEPTED' || d.decision === 'RESOLVED').length} accepted, ${diag.operatorDecisions.filter((d) => d.decision === 'REJECTED').length} rejected
  // `)
}
