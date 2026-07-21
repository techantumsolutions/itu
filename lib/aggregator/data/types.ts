/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */

export type PlanMappingRepairAction = 'repaired' | 'created' | 'unchanged' | 'synced' | 'skipped'

export type PlanMappingRow = Record<string, unknown> & {
  id?: string
  system_plan_id?: string
  service_provider_id?: string
  provider_plan_id?: string | null
  provider_plan_raw_id?: string | null
  is_verified?: boolean | null
}

export type PlanMappingValidationStats = {
  staleRawIdsFixed: number
  missingMappings: number
  pricingSynced: number
  mappingsProcessed: number
  availabilityUpdated: number
}

export type SystemPlanProviderLabels = {
  names: string[]
  codes: string[]
}
