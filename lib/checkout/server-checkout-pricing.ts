/**
 * Server-authoritative checkout pricing for prepare-checkout.
 *
 * Loads plan face value from catalog (system plan + provider raw mappings),
 * resolves fee bands from app_settings, and computes the immutable payable
 * total. Client monetary fields must never feed this path.
 */

import { batchLoadSystemPlanMappedDetails } from '@/lib/catalog/system-plan-mapped-details'
import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  computeRechargeProcessingFeeAmount,
  loadRechargeProcessingFeeConfig,
  resolveRechargeProcessingFeesForAmount,
  resolveRechargeProcessingFeesForLocalAmount,
  type RechargeProcessingFees,
} from '@/lib/settings/recharge-processing-fees'
import { convertAmountToEur } from '@/lib/settings/recharge-monthly-limit'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type ServerCheckoutPricing = {
  /** Catalog plan face value (destination / recharge amount). */
  planPrice: number
  currency: string
  platformFee: number
  paymentGatewayFee: number
  tax: number
  /** platform + gateway (excludes tax). */
  serviceFee: number
  /** Immutable payable = planPrice + platformFee + paymentGatewayFee + tax. */
  payableAmount: number
  fees: RechargeProcessingFees
  rangeId: string | null
  systemPlanId: string | null
  planName?: string
  rechargeSource: 'mapping_raw' | 'system_plan'
}

export type ServerCheckoutPricingResult =
  | { ok: true; pricing: ServerCheckoutPricing }
  | { ok: false; error: string; status: number }

async function resolveSystemPlanId(input: {
  planId: string
  systemPlanId?: string
}): Promise<string | null> {
  const explicit = (input.systemPlanId || '').trim()
  if (explicit) {
    const res = await supabaseRest(
      `system_plans?id=eq.${enc(explicit)}&select=id&limit=1`,
      { cache: 'no-store' },
    )
    if (res.ok) {
      const rows = (await res.json()) as Array<{ id?: string }>
      if (rows[0]?.id) return rows[0].id
    }
  }

  const planId = input.planId.trim()
  if (!planId) return null

  // planId may already be a system_plans.id
  const asSystem = await supabaseRest(
    `system_plans?id=eq.${enc(planId)}&select=id&limit=1`,
    { cache: 'no-store' },
  )
  if (asSystem.ok) {
    const rows = (await asSystem.json()) as Array<{ id?: string }>
    if (rows[0]?.id) return rows[0].id
  }

  // Or an internal_plans.id / system_plans.internal_plan_id
  const byInternal = await supabaseRest(
    `system_plans?internal_plan_id=eq.${enc(planId)}&select=id&limit=1`,
    { cache: 'no-store' },
  )
  if (byInternal.ok) {
    const rows = (await byInternal.json()) as Array<{ id?: string }>
    if (rows[0]?.id) return rows[0].id
  }

  return null
}

async function fetchEurBaseRates(): Promise<Record<string, number> | null> {
  const { fetchEurBaseRates: fetchShared } = await import('@/lib/checkout/currency-conversion')
  return fetchShared()
}

/**
 * Resolve immutable payable from catalog + fee settings.
 * Ignores any client-supplied amount / fee / price fields.
 */
export async function resolveServerCheckoutPricing(input: {
  planId: string
  systemPlanId?: string
}): Promise<ServerCheckoutPricingResult> {
  const systemPlanId = await resolveSystemPlanId(input)
  if (!systemPlanId) {
    return { ok: false, error: 'Plan not found', status: 404 }
  }

  const detailsMap = await batchLoadSystemPlanMappedDetails([systemPlanId])
  const details = detailsMap.get(systemPlanId)
  if (!details?.recharge?.amount || details.recharge.amount <= 0) {
    return { ok: false, error: 'Unable to resolve plan selling price from catalog', status: 422 }
  }

  const planPrice = details.recharge.amount
  const currency = (details.recharge.currency || 'INR').trim().toUpperCase() || 'INR'

  const feeConfig = await loadRechargeProcessingFeeConfig()
  const eurBaseRates = await fetchEurBaseRates()
  let resolved = resolveRechargeProcessingFeesForLocalAmount(
    planPrice,
    currency,
    feeConfig,
    eurBaseRates,
  )

  // Match GET /api/settings/recharge-processing-fees fallback when live FX is unavailable.
  if (resolved.amountEur == null && currency !== 'EUR') {
    const amountEur = await convertAmountToEur(planPrice, currency)
    if (amountEur != null) {
      const band = resolveRechargeProcessingFeesForAmount(amountEur, feeConfig)
      resolved = { ...band, amountEur }
    }
  }

  const computed = computeRechargeProcessingFeeAmount(planPrice, resolved)
  const serviceFee = Math.round((computed.platformFee + computed.paymentGatewayFee) * 100) / 100
  const payableAmount =
    Math.round((planPrice + computed.platformFee + computed.paymentGatewayFee + computed.tax) * 100) /
    100

  if (!(payableAmount > 0)) {
    return { ok: false, error: 'Computed payable amount is invalid', status: 422 }
  }

  return {
    ok: true,
    pricing: {
      planPrice,
      currency,
      platformFee: computed.platformFee,
      paymentGatewayFee: computed.paymentGatewayFee,
      tax: computed.tax,
      serviceFee,
      payableAmount,
      fees: {
        taxPercent: resolved.taxPercent,
        platformFeePercent: resolved.platformFeePercent,
        paymentGatewayFeePercent: resolved.paymentGatewayFeePercent,
      },
      rangeId: resolved.rangeId,
      systemPlanId,
      planName: details.planName,
      rechargeSource: details.rechargeSource,
    },
  }
}

/** Snapshot stored on the pending transaction for later payment linkage (no client fees). */
export function serverPricingToTransactionMeta(pricing: ServerCheckoutPricing): Record<string, unknown> {
  return {
    plan_price: pricing.planPrice,
    plan_price_currency: pricing.currency,
    platform_fee: pricing.platformFee,
    payment_gateway_fee: pricing.paymentGatewayFee,
    tax: pricing.tax,
    service_fee: pricing.serviceFee,
    total_payable: pricing.payableAmount,
    payment_currency: pricing.currency,
    user_pay_amount: pricing.payableAmount,
    pricing_source: 'server',
    fee_range_id: pricing.rangeId,
    fee_percents: pricing.fees,
    system_plan_id: pricing.systemPlanId,
  }
}
