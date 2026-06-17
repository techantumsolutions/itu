export type PlanMergeHistoryRow = {
  id: string
  countryIso3: string
  systemOperatorMergeKey: string
  sourcePlanSignature: string
  targetPlanSignature: string
  sourcePlanName: string
  targetPlanName: string
  mergeReason: string
  mergedByAdmin: string | null
  isActive: boolean
  createdAt?: string | null
}

export type PlanMergeHistoryUpsertInput = {
  countryIso3: string
  systemOperatorMergeKey: string
  sourcePlanSignature: string
  targetPlanSignature: string
  sourcePlanName: string
  targetPlanName: string
  mergeReason?: string
  mergedByAdmin?: string | null
  isActive?: boolean
}

export type PlanMergeHistoryApplyResult = {
  applied: number
  skipped: number
  merged: number
}
