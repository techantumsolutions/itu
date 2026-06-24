export type RechargeRoutingSource = 'ROUTING_RULE' | 'LCR' | 'FALLBACK'

export type OrchestrationRoutingLogFields = {
  system_plan_id: string | null
  internal_plan_id: string | null
  provider_id: string | null
  provider_plan_id: string | null
  provider_plan_raw_id: string | null
  provider_wholesale_amount: number | null
  provider_wholesale_currency: string | null
  destination_face_value: number | null
  destination_currency: string | null
  routing_source: RechargeRoutingSource | null
}

export function orchestrationRoutingLogFields(input: {
  systemPlanId?: string | null
  internalPlanId?: string | null
  providerId?: string | null
  providerPlanId?: string | null
  providerPlanRawId?: string | null
  providerWholesaleAmount?: number | null
  providerWholesaleCurrency?: string | null
  destinationFaceValue?: number | null
  destinationCurrency?: string | null
  routingSource?: RechargeRoutingSource | null
}): OrchestrationRoutingLogFields {
  return {
    system_plan_id: input.systemPlanId ?? null,
    internal_plan_id: input.internalPlanId ?? null,
    provider_id: input.providerId ?? null,
    provider_plan_id: input.providerPlanId ?? null,
    provider_plan_raw_id: input.providerPlanRawId ?? null,
    provider_wholesale_amount: input.providerWholesaleAmount ?? null,
    provider_wholesale_currency: input.providerWholesaleCurrency ?? null,
    destination_face_value: input.destinationFaceValue ?? null,
    destination_currency: input.destinationCurrency ?? null,
    routing_source: input.routingSource ?? null,
  }
}

export function mergeOrchestrationLogIntoStatus(
  status: Record<string, unknown>,
  fields: OrchestrationRoutingLogFields,
): Record<string, unknown> {
  return { ...status, ...fields }
}
