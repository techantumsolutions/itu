export type MergeHistoryMatchMethod = 'exact' | 'normalized' | 'alias' | 'fuzzy'

export type OperatorMergeHistoryRow = {
  id: string
  countryIso3: string
  sourceOperatorName: string
  sourceOperatorNormalized: string
  targetOperatorName: string
  targetOperatorNormalized: string
  mergeReason: string
  mergedByAdmin: string | null
  isActive: boolean
}

export type OperatorMergeHistoryUpsertInput = {
  countryIso3: string
  sourceOperatorName: string
  targetOperatorName: string
  mergeReason?: string
  mergedByAdmin?: string | null
  isActive?: boolean
}

export type OperatorMergeHistoryMatchResult = {
  row: OperatorMergeHistoryRow
  matchMethod: MergeHistoryMatchMethod
  similarity: number
  matchedValue: string
}
