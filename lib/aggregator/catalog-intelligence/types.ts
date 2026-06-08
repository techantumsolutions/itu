export type OperatorDomain =
  | 'MOBILE'
  | 'DTH'
  | 'UTILITY'
  | 'GAMING'
  | 'GIFTCARD'
  | 'RETAIL'
  | 'OTT'
  | 'TRAVEL'
  | 'FOOD'
  | 'BANKING'
  | 'UNKNOWN'

export type PlanDomainClassification = {
  domain: OperatorDomain
  confidence: number
  matchedKeywords: string[]
  reasons: string[]
}

export type OperatorDomainEvaluation = {
  domain: OperatorDomain
  confidence: number
  reasons: string[]
  matchedKeywords: string[]
  matchedRules: string[]
  classificationSource: string
  isBlockedFromTelecom: boolean
  domainBreakdown: Record<string, number>
  rejectionReason?: string
}

export type NonTelecomOperatorMatch = {
  normalizedName: string
  operatorName: string
  operatorDomain: OperatorDomain
  confidence: number
}

export type OperatorDomainRegistryMatch = {
  normalizedName: string
  operatorName: string
  operatorDomain: OperatorDomain
  confidence: number
}

export type TelecomConfidenceLevel =
  | 'HIGH_CONFIDENCE_TELECOM'
  | 'MEDIUM_CONFIDENCE_TELECOM'
  | 'LOW_CONFIDENCE_TELECOM'
  | 'UNKNOWN'
  | 'SUSPICIOUS_NON_TELECOM'
  | 'CONFIRMED_NON_TELECOM'

export type PlanCatalogStatus = 'ACTIVE' | 'REVIEW' | 'QUARANTINED' | 'NON_TELECOM' | 'DEPRECATED'

export type RawQualityMetrics = {
  rawQualityScore: number
  hasDescription: boolean
  hasBenefits: boolean
  hasCategory: boolean
  hasAmount: boolean
  hasValidity: boolean
  hasCurrency: boolean
  rawCompletenessPercent: number
}

export type EnrichmentResult = {
  normalizedTitle: string
  normalizedDescription: string
  inferredServiceType?: string
  inferredSubservice?: string
  inferredValidity?: string
  inferredDataMb?: number
  inferredTalktime?: string
  inferredSms?: string
  confidenceScore: number
  enrichmentSource: string
  matchedKeywords: string[]
}

export type LayerScores = {
  trustedOperator: number
  titleIntelligence: number
  providerCategory: number
  benefits: number
  negativeSignals: number
  pricePattern: number
}

export type PlanClassificationOutput = {
  confidenceLevel: TelecomConfidenceLevel
  confidenceScore: number
  serviceType?: string
  subservice?: string
  reasons: string[]
  matchedKeywords: string[]
  layerScores: LayerScores
  enrichment: EnrichmentResult
  catalogStatus: PlanCatalogStatus
  shouldPromote: boolean
  shouldQuarantine: boolean
  rejectionReason?: string
  rawQuality: RawQualityMetrics
}

export type OperatorPromotionOutput = {
  shouldPromote: boolean
  shouldDeactivate: boolean
  confidenceLevel: TelecomConfidenceLevel
  confidenceScore: number
  reasons: string[]
  trustedOperator: boolean
  telecomPlanCount: number
  mediumConfidencePlanCount: number
  lowConfidencePlanCount: number
  confirmedNonTelecomCount: number
  totalPlanCount: number
  telecomRatio: number
  failedSyncCount?: number
  operatorDomain: OperatorDomain
  operatorDomainConfidence: number
  domainClassificationSource?: string
  domainBlocked: boolean
  domainEvaluation?: OperatorDomainEvaluation
}

export type TrustedOperatorMatch = {
  normalizedName: string
  displayName: string
  countryCode: string
  trustLevel: string
  isVerifiedTelecom: boolean
} | null
