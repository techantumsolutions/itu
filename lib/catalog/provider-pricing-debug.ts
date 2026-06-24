/** Debug metadata attached to admin pricing responses (additive — does not change UI behavior). */
export type ProviderPricingDebugMeta = {
  providerName: string
  providerPlanId: string | null
  providerPlanRawId: string | null
  provider_wholesale_amount: number | null
  provider_wholesale_currency: string | null
  destination_face_value: number | null
  destination_currency: string | null
  sourceTable: string | null
  sourceFile: string | null
  sourceQuery: string | null
  existsInPlanMappings: boolean
  orphanInternalMapping?: boolean
}
