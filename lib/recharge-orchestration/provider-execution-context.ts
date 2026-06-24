import type { ProviderPayloadStrategy } from '@/lib/routing/provider-payload-strategy'
import type { RoutingProviderCandidate } from '@/lib/routing/types'
import type { SystemPlanProviderRow } from '@/lib/recharge-orchestration/resolve-providers-for-system-plan'
import {
  buildProviderExecutionContextFromCandidate,
  type ProviderExecutionContext,
} from '@/lib/lcr-v2/provider-execution-context'

export type RechargeProviderExecutionContext = ProviderExecutionContext & {
  systemPlanId: string | null
  internalPlanId: string | null
  providerPlanRawId: string | null
}

function finitePositive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Standard execution context from routing candidate + orchestration metadata. */
export function buildRechargeProviderExecutionContext(input: {
  candidate: RoutingProviderCandidate
  adapterKey: string
  phoneDigits: string
  externalId: string
  customer_payment_amount: number
  customer_payment_currency: string
  systemPlanId?: string | null
  internalPlanId?: string | null
  providerPlanRawId?: string | null
}): RechargeProviderExecutionContext {
  const base = buildProviderExecutionContextFromCandidate(input)
  return {
    ...base,
    systemPlanId: input.systemPlanId ?? null,
    internalPlanId: input.internalPlanId ?? null,
    providerPlanRawId: input.providerPlanRawId ?? null,
  }
}

/** Build execution context directly from authoritative plan_mappings row. */
export function buildRechargeProviderExecutionContextFromAuthoritative(input: {
  provider: SystemPlanProviderRow
  adapterKey: string
  phoneDigits: string
  externalId: string
  customer_payment_amount: number
  customer_payment_currency: string
  providerPayloadStrategy?: ProviderPayloadStrategy
}): RechargeProviderExecutionContext {
  const wholesaleAmount = finitePositive(input.provider.provider_wholesale_amount) ?? 0
  const wholesaleCurrency =
    (input.provider.provider_wholesale_currency ?? '').trim().toUpperCase() || 'EUR'
  const destinationFace =
    finitePositive(input.provider.destination_face_value) ?? wholesaleAmount
  const destinationCurrency =
    (input.provider.destination_currency ?? wholesaleCurrency).trim().toUpperCase() ||
    wholesaleCurrency

  return {
    providerId: input.provider.providerId,
    providerPlanId: input.provider.providerPlanId,
    adapterKey: input.adapterKey.trim().toLowerCase(),
    providerPayloadStrategy: input.providerPayloadStrategy ?? 'PLAN_ID',
    provider_wholesale_amount: wholesaleAmount,
    provider_wholesale_currency: wholesaleCurrency,
    destination_face_value: destinationFace,
    destination_currency: destinationCurrency,
    customer_payment_amount: input.customer_payment_amount,
    customer_payment_currency: input.customer_payment_currency.trim().toUpperCase() || 'INR',
    phoneDigits: input.phoneDigits,
    externalId: input.externalId,
    systemPlanId: input.provider.systemPlanId,
    internalPlanId: input.provider.internalPlanId,
    providerPlanRawId: input.provider.providerPlanRawId,
  }
}

export type { ProviderExecutionContext }
