/**
 * Pre-payment checkout preparation: routing + LCR only (no provider recharge API calls).
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import { resolveProvider, normalizeCountryToIso3, resolveSystemOperator } from '@/lib/routing/routing-engine-service'
import { dbGetInternalPlan, dbInsertRechargeAttempt, dbGetProvider } from '@/lib/lcr-v2/recharge-db'
import { insertDetailedRoutingLog } from '@/lib/routing/repository'
import {
  buildRoutingDecisionSnapshot,
  buildEvaluatedProviderSnapshots,
  type LcrSelectionResult,
  type RoutingDecisionSnapshot,
} from '@/lib/topup/routing-snapshot'
import {
  pricingFieldsFromCandidate,
  detailedRoutingLogPricingInput,
} from '@/lib/routing/provider-pricing-log-fields'
import type { RoutingProviderCandidate } from '@/lib/routing/types'
import { toInternationalSubscriberDigits } from '@/lib/lcr/countries'
import {
  providerPreValidation,
} from '@/lib/lcr-v2/provider-pre-validation'
import {
  buildRechargeProviderExecutionContext,
} from '@/lib/recharge-orchestration/provider-execution-context'
import {
  assertAuthoritativeProviderForRecharge,
} from '@/lib/recharge-orchestration/validate-orchestration-provider'
import { resolveSystemPlanFromInternalPlan } from '@/lib/recharge-orchestration/resolve-system-plan-from-internal-plan'
import { loadRechargeProcessingFeeConfig } from '@/lib/settings/recharge-processing-fees'
import {
  assertWithinMonthlyRechargeLimit,
  getMonthlyRechargeLimitEur,
  type MonthlyRechargeUsage,
} from '@/lib/settings/recharge-monthly-limit'
import { fetchEurBaseRates } from '@/lib/checkout/currency-conversion'
import {
  resolveServerCheckoutPricing,
  serverPricingToTransactionMeta,
  type ServerCheckoutPricing,
} from '@/lib/checkout/server-checkout-pricing'

function enc(v: string): string {
  return encodeURIComponent(v)
}

function candidatePricingLog(candidate: RoutingProviderCandidate | null | undefined) {
  return detailedRoutingLogPricingInput(pricingFieldsFromCandidate(candidate), {
    providerPlanId: candidate?.providerPlanId,
  })
}

export type PrepareCheckoutInput = {
  planId: string
  systemPlanId?: string
  mobileNumber: string
  operatorId: string
  countryId: string
  userId?: string
}

export type PrepareCheckoutResult = {
  ok: boolean
  checkoutSessionId?: string
  transactionId?: string
  rechargeOrderId?: string
  rechargeAttemptId?: string
  selectedProviderId?: string
  selectedProviderName?: string
  selectedProviderPlanId?: string
  selectedProviderCost?: number | null
  selectedProviderCurrency?: string | null
  routingResult?: RoutingDecisionSnapshot
  lcrResult?: LcrSelectionResult
  error?: string
  code?: 'FX_CONVERSION_FAILED' | 'PLAN_EXCEEDS_BAND' | 'MONTHLY_LIMIT_EXCEEDED' | 'NO_PROVIDER'
  monthlyUsage?: MonthlyRechargeUsage
  planPriceEur?: number
  operatorName?: string
  /** Server-authoritative payable (plan + fees) in recharge currency. */
  payable?: {
    planPrice: number
    currency: string
    platformFee: number
    paymentGatewayFee: number
    tax: number
    serviceFee: number
    payableAmount: number
  }
}

async function createPendingTransaction(input: {
  planId: string
  systemPlanId?: string
  mobileNumber: string
  operatorId: string
  countryId: string
  userId?: string
  operatorName: string
  pricing: ServerCheckoutPricing
}): Promise<string | null> {
  const pricingMeta = serverPricingToTransactionMeta(input.pricing)
  const res = await supabaseRest('transactions?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        user_id: input.userId || null,
        type: 'recharge',
        amount: input.pricing.payableAmount,
        currency: input.pricing.currency,
        status: 'pending_payment',
        description: `Recharge ${input.mobileNumber}`,
        metadata: {
          plan_id: input.planId,
          system_plan_id: input.pricing.systemPlanId || input.systemPlanId || null,
          mobile_number: input.mobileNumber,
          operator_id: input.operatorId,
          country_id: input.countryId,
          checkout_phase: 'provider_selected_awaiting_payment',
          ...pricingMeta,
        },
      },
    ]),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

async function createPendingRechargeOrder(input: {
  transactionId: string
  planId: string
  mobileNumber: string
  operatorId: string
  operatorName: string
  countryId: string
  pricing: ServerCheckoutPricing
  /** Real catalog plan display name (not operator + uuid). */
  planName?: string
  userId?: string
  rechargeAttemptId?: string
  selectedProviderId?: string
  selectedProviderName?: string
  selectedProviderCost?: number
  selectedProviderCurrency?: string
  routingType?: string
}): Promise<string | null> {
  const currency = input.pricing.currency
  const platformFee = input.pricing.platformFee
  const paymentGatewayFee = input.pricing.paymentGatewayFee
  const serviceFee = input.pricing.serviceFee
  const tax = input.pricing.tax
  const planPrice = input.pricing.planPrice
  const amount = input.pricing.payableAmount
  const providerCost =
    input.selectedProviderCost != null && Number.isFinite(input.selectedProviderCost)
      ? input.selectedProviderCost
      : null
  const providerCostCurrency = input.selectedProviderCurrency
    ? input.selectedProviderCurrency.trim().toUpperCase()
    : null
  const routingType = input.routingType ? String(input.routingType).trim().toUpperCase() : null
  const planDisplayName =
    (input.planName && input.planName.trim()) ||
    input.pricing.planName ||
    `${input.operatorName} Plan`

  // Enforce mandatory user_id lookup fallback
  let userIdValue = input.userId
  if (!userIdValue) {
    const profileRes = await supabaseRest('profiles?select=id&limit=1')
    const profiles = profileRes.ok ? await profileRes.json() : []
    userIdValue = profiles[0]?.id || '00000000-0000-0000-0000-000000000000'
  }

  const baseRow = {
    user_id: userIdValue,
    transaction_id: input.transactionId,
    lcr_attempt_id: input.rechargeAttemptId || null,
    phone_number: input.mobileNumber,
    operator_code: input.operatorId,
    operator_name: input.operatorName,
    country_iso: input.countryId,
    sku_code: input.planId,
    plan_id: input.planId,
    product_name: planDisplayName,
    send_amount: amount,
    send_currency: currency,
    receive_amount: providerCost,
    receive_currency: providerCostCurrency,
    status: 'pending_payment',
    payment_status: 'pending',
    service_fee: serviceFee,
    tax,
    provider: input.selectedProviderName || input.selectedProviderId || null,
    metadata: {
      checkout_phase: 'provider_selected_awaiting_payment',
      plan_price: planPrice,
      plan_price_currency: currency,
      plan_name: planDisplayName,
      product_name: planDisplayName,
      plan_id: input.planId,
      operator_id: input.operatorId,
      operator_name: input.operatorName,
      recharge_currency: currency,
      service_fee: serviceFee,
      service_fee_currency: currency,
      platform_fee: platformFee,
      payment_gateway_fee: paymentGatewayFee,
      tax,
      tax_currency: currency,
      total_payable: amount,
      payment_currency: currency,
      user_pay_amount: amount,
      pricing_source: 'server',
      selected_provider: input.selectedProviderId,
      provider_cost: providerCost,
      provider_cost_currency: providerCostCurrency,
      routing_type: routingType,
      fx_rate: 1,
      fx_from_currency: currency,
      fx_to_currency: currency,
    },
  }

  const pricingColumns = {
    plan_price: planPrice,
    plan_price_currency: currency,
    service_fee_currency: currency,
    tax_currency: currency,
    total_payable: amount,
    payment_currency: currency,
    provider_cost: providerCost,
    provider_cost_currency: providerCostCurrency,
    routing_type: routingType,
    platform_fee: platformFee,
    payment_gateway_fee: paymentGatewayFee,
    fx_rate: 1,
    fx_from_currency: currency,
    fx_to_currency: currency,
  }

  let res = await supabaseRest('recharge_orders?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ ...baseRow, ...pricingColumns }]),
  })
  if (!res.ok) {
    // Older DBs may not have checkout pricing columns yet.
    res = await supabaseRest('recharge_orders?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([baseRow]),
    })
  }
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

async function markTransactionFailed(transactionId: string, error: string, meta?: Record<string, unknown>) {
  await supabaseRest(`transactions?id=eq.${enc(transactionId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'failed',
      metadata: { error, ...meta },
    }),
  })
}

async function selectValidatedProviderFromChain(input: {
  routingResult: Awaited<ReturnType<typeof resolveProvider>>
  transactionId: string
  planId: string
  systemPlanId?: string
  phoneDigits: string
  amount: number
  currency: string
  countryCode: string
  operatorCode: string
}): Promise<{
  candidate: RoutingProviderCandidate | null
  remainingFallbacks: RoutingProviderCandidate[]
  insufficientBalance: Array<{ providerId: string; reason: string }>
  failureReason?: string
}> {
  const primary = input.routingResult.selected
  if (!primary) {
    return { candidate: null, remainingFallbacks: [], insufficientBalance: [] }
  }

  const chain = [primary, ...(input.routingResult.fallbacks ?? [])]
  const insufficientBalance: Array<{ providerId: string; reason: string }> = []
  const planLink = await resolveSystemPlanFromInternalPlan(input.systemPlanId || input.planId)
  const canonicalInternalPlanId = planLink?.internalPlanId ?? input.planId
  const canonicalSystemPlanId = input.systemPlanId ?? planLink?.systemPlanId ?? null

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i]

    const provider = await dbGetProvider(candidate.providerId)
    if (!provider || provider.is_active === false) {
      console.log('[PRE-PAYMENT PROVIDER SELECTION] skipped inactive provider', {
        providerId: candidate.providerId,
      })
      continue
    }

    const orphanCheck = await assertAuthoritativeProviderForRecharge({
      internalPlanId: canonicalInternalPlanId,
      systemPlanId: canonicalSystemPlanId,
      providerId: candidate.providerId,
      providerPlanId: candidate.providerPlanId,
    })

    if (!orphanCheck.ok) {
      console.log('[PRE-PAYMENT PROVIDER SELECTION] skipped orphan/invalid provider', {
        providerId: candidate.providerId,
        reason: orphanCheck.reason,
      })
      continue
    }

    const adapterKey = String(provider.adapter_key || '').toLowerCase()
    const executionContext = buildRechargeProviderExecutionContext({
      candidate,
      adapterKey,
      phoneDigits: input.phoneDigits,
      externalId: `PRE-${input.transactionId.slice(0, 8).toUpperCase()}`,
      customer_payment_amount: input.amount,
      customer_payment_currency: input.currency || 'INR',
      systemPlanId: orphanCheck.systemPlanId ?? null,
      internalPlanId: canonicalInternalPlanId,
      providerPlanRawId: orphanCheck.providerPlanRawId ?? null,
    })

    const preCheck = await providerPreValidation({
      executionContext,
      providerRow: provider as Record<string, unknown>,
    })

    if (!preCheck.eligible) {
      const skipReason = preCheck.logMessage ?? preCheck.reason ?? 'Provider pre-validation failed'
      console.log('[PRE-PAYMENT PROVIDER SELECTION] candidate rejected', {
        providerId: candidate.providerId,
        reason: skipReason,
      })
      if (preCheck.reason === 'insufficient_balance') {
        insufficientBalance.push({ providerId: candidate.providerId, reason: skipReason })
      }
      await insertDetailedRoutingLog({
        transactionId: input.transactionId,
        countryCode: input.countryCode,
        operatorCode: input.operatorCode,
        planId: input.planId,
        routingStrategy: input.routingResult.settings?.routingStrategy || 'LEAST_COST',
        routingRuleMatched: input.routingResult.routingType === 'RULE' ? 'Yes' : 'No',
        ...candidatePricingLog(candidate),
        providerPriority: candidate.providerPriority,
        executionResult: 'PROVIDER_PRE_VALIDATION_SKIPPED',
        attemptNumber: i + 1,
        failureReason: skipReason,
        responseCode: preCheck.reason ?? null,
        responseMessage: skipReason,
      }).catch(() => {})
      continue
    }

    return {
      candidate,
      remainingFallbacks: chain.slice(i + 1),
      insufficientBalance,
    }
  }

  return {
    candidate: null,
    remainingFallbacks: [],
    insufficientBalance,
    failureReason:
      'No active provider available for this transaction',
  }
}

async function logProviderSelection(input: {
  transactionId: string
  planId: string
  countryCode: string
  operatorCode: string
  routingResult: Awaited<ReturnType<typeof resolveProvider>>
  insufficientBalance?: Array<{ providerId: string; reason: string }>
  selected?: RoutingProviderCandidate | null
}) {
  const evaluated = buildEvaluatedProviderSnapshots(input.routingResult)
  const writes = (input.routingResult.evaluated || []).map(async (e: RoutingProviderCandidate & { filterReason?: string; reason?: string }) => {
    const isFiltered = !e.eligible
    const filterReason = e.filterReason || e.reason || (e.eligible ? 'ELIGIBLE' : 'PRICE_MISSING')
    await insertDetailedRoutingLog({
      transactionId: input.transactionId,
      countryCode: input.countryCode,
      operatorCode: input.operatorCode,
      planId: input.planId,
      routingStrategy: input.routingResult.settings?.routingStrategy || 'LEAST_COST',
      routingRuleMatched: input.routingResult.routingType === 'RULE' ? 'Yes' : 'No',
      ...candidatePricingLog(e),
      providerPriority: e.providerPriority,
      executionResult: isFiltered ? 'LCR_PROVIDER_FILTERED' : 'LCR_PROVIDER_DISCOVERED',
      failureReason: isFiltered ? filterReason : undefined,
    }).catch(() => {})
  })
  await Promise.all(writes)

  console.log('[PRE-PAYMENT PROVIDER SELECTION]', {
    transactionId: input.transactionId,
    candidates: evaluated.length,
    filtered: evaluated.filter((e) => !e.eligibility).map((e) => ({
      id: e.providerId,
      reason: e.filterReason,
    })),
    insufficientBalance: input.insufficientBalance ?? [],
    inactive: evaluated.filter((e) => e.activeStatus === false).map((e) => e.providerId),
    selected: (() => {
      const sel = input.selected ?? input.routingResult.selected
      if (!sel) return null
      return {
        id: sel.providerId,
        name: sel.providerName,
        cost: sel.provider_wholesale_amount ?? sel.price,
        currency: sel.provider_wholesale_currency ?? sel.currency,
      }
    })(),
  })
}

export async function prepareCheckout(input: PrepareCheckoutInput): Promise<PrepareCheckoutResult> {
  const pricingResult = await resolveServerCheckoutPricing({
    planId: input.planId,
    systemPlanId: input.systemPlanId,
  })
  if (!pricingResult.ok) {
    return { ok: false, error: pricingResult.error }
  }
  const pricing = pricingResult.pricing
  const effectiveSystemPlanId = pricing.systemPlanId || input.systemPlanId

  const normalizedCountryId = await normalizeCountryToIso3(input.countryId)
  const operatorInfo = await resolveSystemOperator(input.operatorId, normalizedCountryId)
  const normalizedInput = {
    ...input,
    systemPlanId: effectiveSystemPlanId || undefined,
    countryId: normalizedCountryId,
    operatorId: operatorInfo.id,
  }

  // Rolling 30-day EUR recharge cap from fee-range max amounts (server face only)
  try {
    const feeConfig = await loadRechargeProcessingFeeConfig()
    const eurBaseRates = await fetchEurBaseRates()
    const limitCheck = await assertWithinMonthlyRechargeLimit({
      config: feeConfig,
      planPrice: pricing.planPrice,
      planCurrency: pricing.currency,
      userId: input.userId,
      phoneNumber: input.mobileNumber,
      eurBaseRates,
    })
    if (!limitCheck.ok) {
      return {
        ok: false,
        error: limitCheck.error,
        code: limitCheck.code,
        monthlyUsage: limitCheck.usage,
        planPriceEur: limitCheck.planPriceEur,
      }
    }
  } catch (e) {
    console.error('[prepareCheckout] monthly limit check failed:', e)
    try {
      const feeConfig = await loadRechargeProcessingFeeConfig()
      if (getMonthlyRechargeLimitEur(feeConfig) != null) {
        return {
          ok: false,
          error: 'Unable to verify monthly recharge limit. Please try again shortly.',
        }
      }
    } catch {
      /* ignore */
    }
  }

  const transactionId = await createPendingTransaction({
    planId: normalizedInput.planId,
    systemPlanId: normalizedInput.systemPlanId,
    mobileNumber: normalizedInput.mobileNumber,
    operatorId: normalizedInput.operatorId,
    countryId: normalizedInput.countryId,
    userId: normalizedInput.userId,
    operatorName: operatorInfo.name,
    pricing,
  })
  if (!transactionId) {
    return { ok: false, error: 'Failed to create pending transaction' }
  }

  const checkoutSessionId = transactionId

  let routingResult
  try {
    routingResult = await resolveProvider({
      countryId: normalizedInput.countryId,
      operatorId: normalizedInput.operatorId,
      productId: normalizedInput.planId,
      systemPlanId: normalizedInput.systemPlanId,
      transactionId,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Routing engine error'
    await markTransactionFailed(transactionId, errMsg)
    return { ok: false, transactionId, checkoutSessionId, error: errMsg }
  }

  const plan = await dbGetInternalPlan(normalizedInput.planId)
  const countryCode = plan?.country_iso3 ?? normalizedInput.countryId ?? ''
  const operatorCode = plan?.operator_ref ?? normalizedInput.operatorId ?? ''

  let resolvedPlanName =
    (typeof plan?.uti_plan_name === 'string' && plan.uti_plan_name.trim()) ||
    (typeof plan?.name === 'string' && plan.name.trim()) ||
    pricing.planName ||
    ''
  if (!resolvedPlanName && normalizedInput.systemPlanId) {
    const sysRes = await supabaseRest(
      `system_plans?id=eq.${enc(normalizedInput.systemPlanId)}&select=system_plan_name&limit=1`,
      { cache: 'no-store' },
    )
    if (sysRes.ok) {
      const rows = (await sysRes.json()) as Array<{ system_plan_name?: string | null }>
      resolvedPlanName = rows[0]?.system_plan_name?.trim() || ''
    }
  }
  if (!resolvedPlanName) {
    const sysByInternal = await supabaseRest(
      `system_plans?internal_plan_id=eq.${enc(normalizedInput.planId)}&select=system_plan_name&limit=1`,
      { cache: 'no-store' },
    )
    if (sysByInternal.ok) {
      const rows = (await sysByInternal.json()) as Array<{ system_plan_name?: string | null }>
      resolvedPlanName = rows[0]?.system_plan_name?.trim() || ''
    }
  }

  if (!routingResult.selected) {
    const errMsg = 'No active provider available for this transaction'
    const reason = routingResult.routing_decision_reason || 'NO_ELIGIBLE_PROVIDER'
    await insertDetailedRoutingLog({
      transactionId,
      countryCode,
      operatorCode,
      planId: normalizedInput.planId,
      routingStrategy: routingResult.settings?.routingStrategy || 'LEAST_COST',
      routingRuleMatched: 'No',
      executionResult: reason,
    }).catch(() => {})
    await markTransactionFailed(transactionId, errMsg, { routing: routingResult })
    return { ok: false, transactionId, checkoutSessionId, error: errMsg, code: 'NO_PROVIDER' }
  }

  const phoneDigits = toInternationalSubscriberDigits(
    normalizedInput.countryId,
    normalizedInput.mobileNumber,
  )
  const selection = await selectValidatedProviderFromChain({
    routingResult,
    transactionId,
    planId: normalizedInput.planId,
    systemPlanId: normalizedInput.systemPlanId,
    phoneDigits,
    amount: pricing.payableAmount,
    currency: pricing.currency,
    countryCode,
    operatorCode,
  })

  await logProviderSelection({
    transactionId,
    planId: normalizedInput.planId,
    countryCode,
    operatorCode,
    routingResult,
    insufficientBalance: selection.insufficientBalance,
    selected: selection.candidate,
  })

  if (!selection.candidate) {
    const errMsg = selection.failureReason ?? 'No active provider available for this transaction'
    await markTransactionFailed(transactionId, errMsg, {
      insufficient_balance: selection.insufficientBalance,
    })
    return { ok: false, transactionId, checkoutSessionId, error: errMsg, code: 'NO_PROVIDER' }
  }

  const selected = selection.candidate
  const fallbackQueue = selection.remainingFallbacks.map((f) => f.providerName || f.providerId)

  const built = await buildRoutingDecisionSnapshot({
    transactionId,
    planId: normalizedInput.planId,
    systemPlanId: normalizedInput.systemPlanId,
    routingResult,
    lockedCandidate: selected,
    fallbackQueue,
  })
  if (!built) {
    await markTransactionFailed(transactionId, 'Failed to build routing snapshot')
    return { ok: false, transactionId, checkoutSessionId, error: 'Failed to build routing snapshot' }
  }

  const { snapshot, lcrResult } = built
  const idempotencyKey = `prep-${transactionId}`

  const attempt = await dbInsertRechargeAttempt({
    idempotencyKey,
    distributorRef: transactionId,
    internalPlanId: snapshot.internal_plan_id,
    phoneNumber: phoneDigits,
    sendAmount: pricing.payableAmount,
    currency: pricing.currency,
    routingDecision: { ...snapshot, lcr_result: lcrResult },
    status: 'pending_payment',
    selectedProviderId: selected.providerId,
    selectedProviderPlanId: selected.providerPlanId,
  }).catch((e) => {
    console.error('[prepareCheckout] Failed to insert recharge attempt:', e)
    return null
  })

  if (!attempt) {
    await markTransactionFailed(transactionId, 'Failed to persist provider selection')
    return { ok: false, transactionId, checkoutSessionId, error: 'Failed to persist provider selection' }
  }

  const provider = await dbGetProvider(selected.providerId)

  await insertDetailedRoutingLog({
    transactionId,
    countryCode,
    operatorCode,
    planId: normalizedInput.planId,
    routingStrategy: snapshot.routing_strategy,
    routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
    routingRuleId: routingResult.ruleId,
    ...candidatePricingLog(selected),
    providerPriority: selected.providerPriority,
    executionResult: routingResult.routingType === 'RULE' ? 'RULE_PROVIDER_SELECTED' : 'LCR_PROVIDER_SELECTED',
  }).catch(() => {})

  const rechargeOrderId = await createPendingRechargeOrder({
    transactionId,
    planId: normalizedInput.planId,
    mobileNumber: normalizedInput.mobileNumber,
    operatorId: normalizedInput.operatorId,
    operatorName: operatorInfo.name,
    countryId: normalizedInput.countryId,
    pricing,
    planName: resolvedPlanName || undefined,
    userId: input.userId,
    rechargeAttemptId: attempt.id,
    selectedProviderId: selected.providerId,
    selectedProviderName: provider?.name || selected.providerName,
    selectedProviderCost: selected.provider_wholesale_amount ?? selected.price,
    selectedProviderCurrency: selected.provider_wholesale_currency ?? selected.currency,
    routingType: routingResult.routingType,
  })

  const txnMetaRes = await supabaseRest(`transactions?id=eq.${enc(transactionId)}&select=metadata&limit=1`, {
    cache: 'no-store',
  })
  let prevMeta: Record<string, unknown> = {}
  if (txnMetaRes.ok) {
    const rows = (await txnMetaRes.json()) as Array<{ metadata?: Record<string, unknown> }>
    prevMeta = rows[0]?.metadata ?? {}
  }

  await supabaseRest(`transactions?id=eq.${enc(transactionId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      metadata: {
        ...prevMeta,
        ...serverPricingToTransactionMeta(pricing),
        plan_id: normalizedInput.planId,
        system_plan_id: normalizedInput.systemPlanId || null,
        mobile_number: normalizedInput.mobileNumber,
        operator_id: normalizedInput.operatorId,
        country_id: normalizedInput.countryId,
        checkout_session_id: checkoutSessionId,
        recharge_attempt_id: attempt.id,
        recharge_order_id: rechargeOrderId,
        selected_provider_id: selected.providerId,
        selected_provider_name: selected.providerName || provider?.name,
        selected_provider_plan_id: selected.providerPlanId,
        selected_provider_cost: lcrResult.selectedProviderCost,
        selected_provider_currency: lcrResult.selectedProviderCurrency,
        routing_result: snapshot,
        lcr_result: lcrResult,
        routing_type: routingResult.routingType,
        provider_selection_timestamp: snapshot.provider_selection_timestamp,
      },
    }),
  })

  console.log('[PRE-PAYMENT PROVIDER SELECTION] complete', {
    checkoutSessionId,
    transactionId,
    rechargeAttemptId: attempt.id,
    selectedProvider: lcrResult.selectedProviderName,
    payableAmount: pricing.payableAmount,
    currency: pricing.currency,
  })

  return {
    ok: true,
    checkoutSessionId,
    transactionId,
    rechargeOrderId: rechargeOrderId ?? undefined,
    rechargeAttemptId: attempt.id,
    selectedProviderId: selected.providerId,
    selectedProviderName: lcrResult.selectedProviderName ?? undefined,
    selectedProviderPlanId: selected.providerPlanId,
    selectedProviderCost: lcrResult.selectedProviderCost,
    selectedProviderCurrency: lcrResult.selectedProviderCurrency,
    routingResult: snapshot,
    lcrResult,
    operatorName: operatorInfo.name,
    payable: {
      planPrice: pricing.planPrice,
      currency: pricing.currency,
      platformFee: pricing.platformFee,
      paymentGatewayFee: pricing.paymentGatewayFee,
      tax: pricing.tax,
      serviceFee: pricing.serviceFee,
      payableAmount: pricing.payableAmount,
    },
  }
}

/** @deprecated Import from `@/lib/checkout/link-payment-order` */
export {
  linkPaymentOrderToCheckoutSession,
  persistRechargeOrderPaymentTotals,
} from '@/lib/checkout/link-payment-order'
