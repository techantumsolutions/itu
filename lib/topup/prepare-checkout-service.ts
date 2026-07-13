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
  /** Total in recharge currency (plan + fees) used for routing / transaction amount. */
  amount: number
  currency: string
  /** Plan face value only (before fees), as shown on summary. */
  planPrice?: number
  userId?: string
  /** Combined platform + gateway fee (legacy). Prefer platformFee + paymentGatewayFee. */
  serviceFee?: number
  platformFee?: number
  paymentGatewayFee?: number
  tax?: number
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
  operatorName?: string
}

async function createPendingTransaction(input: PrepareCheckoutInput & { operatorName: string }): Promise<string | null> {
  const res = await supabaseRest('transactions?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        user_id: input.userId || null,
        type: 'recharge',
        amount: input.amount,
        currency: input.currency,
        status: 'pending_payment',
        description: `Recharge ${input.mobileNumber}`,
        metadata: {
          plan_id: input.planId,
          system_plan_id: input.systemPlanId || null,
          mobile_number: input.mobileNumber,
          operator_id: input.operatorId,
          country_id: input.countryId,
          checkout_phase: 'provider_selected_awaiting_payment',
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
  amount: number
  currency: string
  planPrice?: number
  /** Real catalog plan display name (not operator + uuid). */
  planName?: string
  userId?: string
  rechargeAttemptId?: string
  serviceFee?: number
  platformFee?: number
  paymentGatewayFee?: number
  tax?: number
  selectedProviderId?: string
  selectedProviderName?: string
  selectedProviderCost?: number
  selectedProviderCurrency?: string
  routingType?: string
}): Promise<string | null> {
  const currency = (input.currency || 'INR').trim().toUpperCase()
  const platformFee = Math.max(0, input.platformFee ?? 0)
  const paymentGatewayFee = Math.max(0, input.paymentGatewayFee ?? 0)
  const serviceFee =
    platformFee + paymentGatewayFee > 0
      ? platformFee + paymentGatewayFee
      : Math.max(0, input.serviceFee ?? 0)
  const tax = input.tax ?? 0
  const planPrice =
    input.planPrice != null && Number.isFinite(input.planPrice) && input.planPrice > 0
      ? input.planPrice
      : Math.max(0, input.amount - serviceFee - tax)
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
    send_amount: input.amount,
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
      total_payable: input.amount,
      payment_currency: currency,
      user_pay_amount: input.amount,
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
    total_payable: input.amount,
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
        selectedProvider: candidate.providerId,
        providerPlanId: candidate.providerPlanId,
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
      selectedProvider: e.providerId,
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
    selected: (input.selected ?? input.routingResult.selected)
      ? {
          id: input.routingResult.selected.providerId,
          name: input.routingResult.selected.providerName,
          cost: input.routingResult.selected.provider_wholesale_amount ?? input.routingResult.selected.price,
          currency: input.routingResult.selected.provider_wholesale_currency ?? input.routingResult.selected.currency,
        }
      : null,
  })
}

export async function prepareCheckout(input: PrepareCheckoutInput): Promise<PrepareCheckoutResult> {
  const normalizedCountryId = await normalizeCountryToIso3(input.countryId)
  const operatorInfo = await resolveSystemOperator(input.operatorId, normalizedCountryId)
  const normalizedInput = {
    ...input,
    countryId: normalizedCountryId,
    operatorId: operatorInfo.id,
  }

  const transactionId = await createPendingTransaction({
    ...normalizedInput,
    operatorName: operatorInfo.name,
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
    return { ok: false, transactionId, checkoutSessionId, error: errMsg }
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
    amount: input.amount,
    currency: input.currency,
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
    return { ok: false, transactionId, checkoutSessionId, error: errMsg }
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
    sendAmount: input.amount,
    currency: input.currency || 'INR',
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
    selectedProvider: selected.providerId,
    providerPlanId: selected.providerPlanId,
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
    amount: input.amount,
    currency: input.currency,
    planPrice: input.planPrice,
    planName: resolvedPlanName || undefined,
    userId: input.userId,
    rechargeAttemptId: attempt.id,
    serviceFee: input.serviceFee,
    platformFee: input.platformFee,
    paymentGatewayFee: input.paymentGatewayFee,
    tax: input.tax,
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
  }
}

/** Link a payment order row to a pre-payment checkout session. */
export async function linkPaymentOrderToCheckoutSession(input: {
  paymentOrderId: string
  checkoutSessionId: string
  transactionId: string
  rechargeAttemptId?: string
  selectedProviderId?: string
  selectedProviderName?: string
  selectedProviderPlanId?: string
  selectedProviderCost?: number | null
  selectedProviderCurrency?: string | null
  routingResult?: unknown
  lcrResult?: unknown
  providerSelectionTimestamp?: string
  /** Final charged amount in payment currency (summary page grand total). */
  totalPayable?: number
  paymentCurrency?: string
  /** Checkout FX + fee snapshot from summary page (rates at recharge time). */
  checkoutPricing?: {
    platformFee?: number
    paymentGatewayFee?: number
    tax?: number
    planPrice?: number
    planPriceCurrency?: string
    totalInRechargeCurrency?: number
    fxRate?: number | null
    fxFromCurrency?: string
    fxToCurrency?: string
  }
}) {
  await supabaseRest(`payment_orders?id=eq.${enc(input.paymentOrderId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'pending_payment',
      checkout_session_id: input.checkoutSessionId,
      pending_transaction_id: input.transactionId,
      lcr_attempt_id: input.rechargeAttemptId ?? null,
      selected_provider_id: input.selectedProviderId ?? null,
      selected_provider_name: input.selectedProviderName ?? null,
      selected_provider_plan_id: input.selectedProviderPlanId ?? null,
      selected_provider_cost: input.selectedProviderCost ?? null,
      selected_provider_currency: input.selectedProviderCurrency ?? null,
      routing_result: input.routingResult ?? null,
      lcr_result: input.lcrResult ?? null,
      provider_selection_timestamp: input.providerSelectionTimestamp ?? new Date().toISOString(),
    }),
  })

  if (
    input.transactionId &&
    input.totalPayable != null &&
    Number.isFinite(input.totalPayable) &&
    input.paymentCurrency
  ) {
    await persistRechargeOrderPaymentTotals({
      transactionId: input.transactionId,
      totalPayable: input.totalPayable,
      paymentCurrency: input.paymentCurrency,
      checkoutPricing: input.checkoutPricing,
    })
  }
}

/** Update final customer charge on the linked recharge order (summary-page totals). */
export async function persistRechargeOrderPaymentTotals(input: {
  transactionId: string
  totalPayable: number
  paymentCurrency: string
  checkoutPricing?: {
    platformFee?: number
    paymentGatewayFee?: number
    tax?: number
    planPrice?: number
    planPriceCurrency?: string
    totalInRechargeCurrency?: number
    fxRate?: number | null
    fxFromCurrency?: string
    fxToCurrency?: string
  }
}) {
  const currency = input.paymentCurrency.trim().toUpperCase()
  const pricing = input.checkoutPricing ?? {}
  const orderRes = await supabaseRest(
    `recharge_orders?transaction_id=eq.${enc(input.transactionId)}&select=id,metadata,send_currency,plan_price_currency&limit=1`,
    { cache: 'no-store' },
  )
  if (!orderRes.ok) return
  const rows = (await orderRes.json()) as Array<{
    id: string
    metadata?: Record<string, unknown>
    send_currency?: string | null
    plan_price_currency?: string | null
  }>
  const order = rows[0]
  if (!order?.id) return

  const fromCurrency = (
    pricing.fxFromCurrency ||
    pricing.planPriceCurrency ||
    order.plan_price_currency ||
    order.send_currency ||
    currency
  )
    .toString()
    .trim()
    .toUpperCase()
  const toCurrency = (pricing.fxToCurrency || currency).toString().trim().toUpperCase()
  const fxRate =
    pricing.fxRate != null && Number.isFinite(pricing.fxRate)
      ? pricing.fxRate
      : fromCurrency === toCurrency
        ? 1
        : null

  const platformFee =
    pricing.platformFee != null && Number.isFinite(pricing.platformFee) ? pricing.platformFee : undefined
  const paymentGatewayFee =
    pricing.paymentGatewayFee != null && Number.isFinite(pricing.paymentGatewayFee)
      ? pricing.paymentGatewayFee
      : undefined
  const serviceFee =
    platformFee != null || paymentGatewayFee != null
      ? (platformFee ?? 0) + (paymentGatewayFee ?? 0)
      : undefined

  const nextMeta: Record<string, unknown> = {
    ...(order.metadata ?? {}),
    total_payable: input.totalPayable,
    payment_currency: currency,
    user_pay_amount: input.totalPayable,
  }
  if (platformFee != null) nextMeta.platform_fee = platformFee
  if (paymentGatewayFee != null) nextMeta.payment_gateway_fee = paymentGatewayFee
  if (serviceFee != null) {
    nextMeta.service_fee = serviceFee
    nextMeta.service_fee_currency = fromCurrency
  }
  if (pricing.tax != null) nextMeta.tax = pricing.tax
  if (pricing.planPrice != null) nextMeta.plan_price = pricing.planPrice
  if (pricing.planPriceCurrency) nextMeta.plan_price_currency = pricing.planPriceCurrency
  if (pricing.totalInRechargeCurrency != null) {
    nextMeta.total_in_recharge_currency = pricing.totalInRechargeCurrency
  }
  if (fxRate != null) {
    nextMeta.fx_rate = fxRate
    nextMeta.fx_from_currency = fromCurrency
    nextMeta.fx_to_currency = toCurrency
    nextMeta.checkout_fx_rate = fxRate
  }

  const columnPatch: Record<string, unknown> = {
    total_payable: input.totalPayable,
    payment_currency: currency,
    metadata: nextMeta,
  }
  if (platformFee != null) columnPatch.platform_fee = platformFee
  if (paymentGatewayFee != null) columnPatch.payment_gateway_fee = paymentGatewayFee
  if (serviceFee != null) columnPatch.service_fee = serviceFee
  if (pricing.tax != null) columnPatch.tax = pricing.tax
  if (pricing.planPrice != null) columnPatch.plan_price = pricing.planPrice
  if (pricing.planPriceCurrency) columnPatch.plan_price_currency = pricing.planPriceCurrency
  if (fxRate != null) {
    columnPatch.fx_rate = fxRate
    columnPatch.fx_from_currency = fromCurrency
    columnPatch.fx_to_currency = toCurrency
  }

  const withColumns = await supabaseRest(`recharge_orders?id=eq.${enc(order.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(columnPatch),
  })

  if (!withColumns.ok) {
    await supabaseRest(`recharge_orders?id=eq.${enc(order.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ metadata: nextMeta }),
    })
  }
}