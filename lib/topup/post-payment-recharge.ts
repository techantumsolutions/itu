/**
 * Post-payment recharge execution using the provider locked at pre-payment selection.
 * Does NOT rerun routing rules or LCR.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import { executeMappedRecharge } from '@/lib/lcr-v2/execute-provider'
import { createAdminNotification } from '@/lib/notifications/admin-notifications'
import {
  dbGetProvider,
  dbFindRechargeByDistributorRef,
  dbFindRechargeByIdempotencyKey,
  dbFindRechargeById,
  dbClaimRechargeAttemptForProcessing,
  dbUpdateRechargeAttempt,
  dbGetInternalPlan,
  type RechargeAttemptRow,
} from '@/lib/lcr-v2/recharge-db'
import { insertDetailedRoutingLog } from '@/lib/routing/repository'
import { processRewardsForTransaction } from '@/lib/rewards/reward-service'
import { providerPreValidation } from '@/lib/lcr-v2/provider-pre-validation'
import { buildRechargeProviderExecutionContext } from '@/lib/recharge-orchestration/provider-execution-context'
import { assertAuthoritativeProviderForRecharge } from '@/lib/recharge-orchestration/validate-orchestration-provider'
import { logProviderExecutionContext } from '@/lib/lcr-v2/provider-execution-context'
import {
  pricingFieldsFromCandidate,
  detailedRoutingLogPricingInput,
} from '@/lib/routing/provider-pricing-log-fields'
import type { RoutingDecisionSnapshot } from '@/lib/topup/routing-snapshot'
import type { RoutingProviderCandidate } from '@/lib/routing/types'
import type { CheckoutInput, CheckoutResult } from '@/lib/topup/checkout-types'
import { toInternationalSubscriberDigits } from '@/lib/lcr/countries'

function enc(v: string): string {
  return encodeURIComponent(v)
}

function candidatePricingLog(candidate: RoutingProviderCandidate | null | undefined) {
  return detailedRoutingLogPricingInput(pricingFieldsFromCandidate(candidate), {
    providerPlanId: candidate?.providerPlanId,
  })
}

async function getEarnedPoints(transactionId: string): Promise<number> {
  const res = await supabaseRest(`reward_ledger?transaction_id=eq.${enc(transactionId)}&select=points`, {
    cache: 'no-store',
  })
  if (!res.ok) return 0
  const rows = (await res.json()) as Array<{ points: number }>
  return rows.reduce((sum, r) => sum + (r.points ?? 0), 0)
}

async function loadPendingTransaction(transactionId: string) {
  const res = await supabaseRest(
    `transactions?id=eq.${enc(transactionId)}&select=id,status,amount,currency,metadata,user_id&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as Array<Record<string, unknown>>
  return rows[0] ?? null
}

async function loadRechargeOrderByTransaction(transactionId: string) {
  const res = await supabaseRest(
    `recharge_orders?transaction_id=eq.${enc(transactionId)}&select=id,status&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string; status: string }>
  return rows[0] ?? null
}

async function createTransactionPayment(input: {
  transactionId: string
  paymentOrderId: string
  gateway: string
  gatewayRef: string
  amount: number
}) {
  await supabaseRest('transaction_payments', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: input.transactionId,
      payment_order_id: input.paymentOrderId,
      payment_gateway: input.gateway,
      gateway_reference: input.gatewayRef,
      amount: input.amount,
      status: 'completed',
    }),
  })
}

async function updateTransactionStatus(id: string, status: string, meta?: Record<string, unknown>) {
  const payload: Record<string, unknown> = { status }
  if (meta) {
    const existing = await supabaseRest(`transactions?id=eq.${enc(id)}&select=metadata`, { cache: 'no-store' })
    const rows = existing.ok ? ((await existing.json()) as Array<{ metadata: Record<string, unknown> }>) : []
    const prev = rows[0]?.metadata ?? {}
    payload.metadata = { ...prev, ...meta }
  }
  await supabaseRest(`transactions?id=eq.${enc(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
}

async function updateRechargeOrder(id: string, patch: Record<string, unknown>) {
  await supabaseRest(`recharge_orders?id=eq.${enc(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
}

function buildCachedSuccessResult(
  transactionId: string,
  attempt: { provider_ref?: string | null; selected_provider_id?: string | null },
  meta: Record<string, unknown>,
  rewardPointsEarned: number,
): CheckoutResult {
  return {
    ok: true,
    transactionId,
    status: 'success',
    providerRef: attempt.provider_ref ?? undefined,
    providerName: typeof meta.selected_provider_name === 'string' ? meta.selected_provider_name : undefined,
    rewardPointsEarned,
  }
}

/**
 * Option (b) support: poll the recharge attempt until it reaches a terminal state
 * (success/failed) so a duplicate verify can return the winner's real result.
 * Bounded wait — no lock, no TTL dependency.
 */
async function waitForAttemptTerminal(
  attemptId: string,
  tries = 10,
  delayMs = 600,
): Promise<RechargeAttemptRow | null> {
  let row: RechargeAttemptRow | null = null
  for (let i = 0; i < tries; i++) {
    row = await dbFindRechargeById(attemptId).catch(() => null)
    if (row && (row.status === 'success' || row.status === 'failed')) return row
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return dbFindRechargeById(attemptId).catch(() => null)
}

export async function executePostPaymentRecharge(input: CheckoutInput): Promise<CheckoutResult> {
  const hints: string[] = []
  const logHint = (msg: string) => {
    const formatted = `[RECHARGE HINT] ${msg}`
    console.log(formatted)
    hints.push(formatted)
  }

  const pendingTransactionId = input.checkoutSessionId || input.pendingTransactionId
  if (!pendingTransactionId) {
    return { ok: false, status: 'failed', error: 'Missing checkout session for post-payment recharge' }
  }

  // Idempotency: payment id or existing successful attempt
  if (input.razorpayPaymentId) {
    const byPayment = await dbFindRechargeByIdempotencyKey(input.razorpayPaymentId).catch(() => null)
    if (byPayment?.status === 'success') {
      const txn = await loadPendingTransaction(pendingTransactionId)
      const meta = (txn?.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}) as Record<string, unknown>
      const points = await getEarnedPoints(pendingTransactionId).catch(() => 0)
      logHint('Idempotent replay: recharge already completed for this payment')
      return buildCachedSuccessResult(pendingTransactionId, byPayment, meta, points)
    }
  }

  const attemptExisting = await dbFindRechargeByDistributorRef(pendingTransactionId).catch(() => null)
  if (attemptExisting?.status === 'success') {
    const txn = await loadPendingTransaction(pendingTransactionId)
    const meta = (txn?.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}) as Record<string, unknown>
    const points = await getEarnedPoints(pendingTransactionId).catch(() => 0)
    logHint('Idempotent replay: recharge attempt already succeeded')
    return buildCachedSuccessResult(pendingTransactionId, attemptExisting, meta, points)
  }

  const txn = await loadPendingTransaction(pendingTransactionId)
  if (!txn) {
    return { ok: false, status: 'failed', error: 'Pending transaction not found' }
  }

  if (txn.status !== 'pending_payment' && txn.status !== 'pending') {
    if (txn.status === 'completed') {
      const meta = (txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}) as Record<string, unknown>
      const points = await getEarnedPoints(pendingTransactionId).catch(() => 0)
      return buildCachedSuccessResult(pendingTransactionId, attemptExisting ?? {}, meta, points)
    }
    return { ok: false, status: 'failed', error: `Invalid transaction status: ${txn.status}` }
  }

  const meta = (txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}) as Record<string, unknown>
  const transactionId = String(txn.id)
  const rechargeOrder = await loadRechargeOrderByTransaction(transactionId)

  // H1 (exactly-once): second atomic claim. Only the request that transitions the
  // recharge attempt pending/pending_payment -> processing may call the provider.
  // Concurrent/duplicate verifies lose the claim and instead wait for the winner's
  // terminal result (option b), so they behave exactly like the original verify
  // from the frontend's perspective. PostgreSQL is the single source of truth here
  // — no Redis, no lock TTL.
  const claimAttempt =
    attemptExisting ?? (await dbFindRechargeByDistributorRef(transactionId).catch(() => null))
  if (!claimAttempt) {
    return { ok: false, transactionId, status: 'failed', error: 'Recharge attempt record not found' }
  }

  const claimedForProcessing = await dbClaimRechargeAttemptForProcessing(claimAttempt.id).catch(() => false)
  if (!claimedForProcessing) {
    const terminal = await waitForAttemptTerminal(claimAttempt.id)
    if (terminal?.status === 'success') {
      const points = await getEarnedPoints(pendingTransactionId).catch(() => 0)
      logHint("Duplicate verify: returning winner's successful result")
      return buildCachedSuccessResult(pendingTransactionId, terminal, meta, points)
    }
    if (terminal?.status === 'failed') {
      logHint("Duplicate verify: returning winner's failed result")
      return {
        ok: false,
        transactionId,
        rechargeOrderId: rechargeOrder?.id,
        status: 'failed',
        error: terminal.error ?? 'Recharge failed',
      }
    }
    // Winner has not written a terminal outcome within the wait window (very slow
    // provider or crashed mid-flight). Surface an unconfirmed state rather than a
    // false success; reconciliation / manual retry resolves it.
    logHint('Duplicate verify: winner still processing after wait window')
    return {
      ok: false,
      transactionId,
      rechargeOrderId: rechargeOrder?.id,
      status: 'failed',
      error: 'RECHARGE_STATUS_UNCONFIRMED',
    }
  }

  console.log('[PAYMENT LOG] payment successful — executing stored provider recharge', {
    transactionId,
    paymentOrderId: input.paymentOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
  })

  await createTransactionPayment({
    transactionId,
    paymentOrderId: input.paymentOrderId,
    gateway: 'razorpay',
    gatewayRef: input.razorpayPaymentId,
    amount: input.amount,
  })

  const attempt =
    attemptExisting ??
    (await dbFindRechargeByDistributorRef(transactionId).catch(() => null))

  if (!attempt) {
    return { ok: false, transactionId, status: 'failed', error: 'Recharge attempt record not found' }
  }

  const routingDecision = (attempt.routing_decision || {}) as RoutingDecisionSnapshot & {
    locked_candidate?: RoutingProviderCandidate
  }
  const lockedCandidate = routingDecision.locked_candidate
  const providerId = attempt.selected_provider_id || routingDecision.selected_provider_id

  if (!providerId || !lockedCandidate) {
    await updateTransactionStatus(transactionId, 'completed', { error: 'STORED_PROVIDER_MISSING' })
    if (rechargeOrder) {
      await updateRechargeOrder(rechargeOrder.id, { 
        status: 'failed', 
        payment_status: 'completed', 
        failure_reason: 'STORED_PROVIDER_MISSING' 
      })
    }
    return { ok: false, transactionId, status: 'failed', error: 'Stored provider selection is missing' }
  }

  const provider = await dbGetProvider(providerId)
  if (!provider || provider.is_active === false) {
    const errMsg = 'PROVIDER_UNAVAILABLE_AFTER_PAYMENT'
    logHint(`Stored provider ${providerId} is no longer active after payment`)
    console.log('[RECHARGE LOG] provider unavailable after payment', { transactionId, providerId })

    await dbUpdateRechargeAttempt(attempt.id, {
      status: 'failed',
      error: errMsg,
    }).catch(() => {})

    await updateTransactionStatus(transactionId, 'completed', {
      error: errMsg,
      provider_unavailable_after_payment: true,
    })

    if (rechargeOrder) {
      await updateRechargeOrder(rechargeOrder.id, {
        status: 'provider_unavailable_after_payment',
        payment_status: 'completed',
        failure_reason: errMsg,
      })
    }

    await createAdminNotification({
      title: 'Recharge Failed after Payment',
      message: `Recharge order ${rechargeOrder?.id || transactionId} failed for phone ${input.mobileNumber} (amount: ${input.amount} ${input.currency || 'INR'}) due to provider unavailable after payment: ${errMsg}`,
      type: 'recharge_failed_after_payment',
      details: { transactionId, rechargeOrderId: rechargeOrder?.id, phoneNumber: input.mobileNumber, error: errMsg }
    })

    return {
      ok: false,
      transactionId,
      rechargeOrderId: rechargeOrder?.id,
      status: 'failed',
      error: 'Selected provider became unavailable after payment. Manual retry required.',
      hints,
    }
  }

  await dbUpdateRechargeAttempt(attempt.id, {
    status: 'processing',
    idempotency_key: input.razorpayPaymentId || attempt.idempotency_key,
  }).catch(() => {})

  await updateTransactionStatus(transactionId, 'completed', {
    payment_order_id: input.paymentOrderId,
    razorpay_payment_id: input.razorpayPaymentId,
    payment_completed_at: new Date().toISOString(),
  })

  if (rechargeOrder) {
    await updateRechargeOrder(rechargeOrder.id, { payment_status: 'completed' })
  }

  const plan = await dbGetInternalPlan(input.planId)
  const countryCode = plan?.country_iso3 ?? input.countryId ?? ''
  const operatorCode = plan?.operator_ref ?? input.operatorId ?? ''
  const adapterKey = String(provider.adapter_key || '').toLowerCase()
  const phoneDigits = toInternationalSubscriberDigits(input.countryId, input.mobileNumber)
  const externalId = `TXN-${transactionId.slice(0, 8).toUpperCase()}-${Date.now()}`

  const orphanCheck = await assertAuthoritativeProviderForRecharge({
    internalPlanId: routingDecision.internal_plan_id || input.planId,
    systemPlanId: routingDecision.system_plan_id,
    providerId,
    providerPlanId: lockedCandidate.providerPlanId,
  })

  if (!orphanCheck.ok) {
    const errMsg = orphanCheck.reason ?? 'Authoritative provider validation failed after payment'
    await dbUpdateRechargeAttempt(attempt.id, { status: 'failed', error: errMsg })
    await updateTransactionStatus(transactionId, 'completed', { error: errMsg })
    if (rechargeOrder) {
      await updateRechargeOrder(rechargeOrder.id, { 
        status: 'failed', 
        payment_status: 'completed', 
        failure_reason: errMsg 
      })
    }
    
    await createAdminNotification({
      title: 'Recharge Failed after Payment',
      message: `Recharge order ${rechargeOrder?.id || transactionId} failed for phone ${input.mobileNumber} (amount: ${input.amount} ${input.currency || 'INR'}) due to authoritative provider validation error: ${errMsg}`,
      type: 'recharge_failed_after_payment',
      details: { transactionId, rechargeOrderId: rechargeOrder?.id, phoneNumber: input.mobileNumber, error: errMsg }
    })

    return { ok: false, transactionId, status: 'failed', error: errMsg, hints }
  }

  const executionContext = buildRechargeProviderExecutionContext({
    candidate: lockedCandidate,
    adapterKey,
    phoneDigits,
    externalId,
    customer_payment_amount: input.amount,
    customer_payment_currency: input.currency || 'INR',
    systemPlanId: orphanCheck.systemPlanId ?? null,
    internalPlanId: input.planId,
    providerPlanRawId: orphanCheck.providerPlanRawId ?? null,
  })

  logProviderExecutionContext(executionContext, 'post-payment-recharge')
  logHint(`Executing stored provider ${lockedCandidate.providerName || providerId} (no re-LCR)`)

  const preCheck = await providerPreValidation({
    executionContext,
    providerRow: provider as Record<string, unknown> | null,
  })
  if (!preCheck.eligible) {
    const errMsg = preCheck.logMessage ?? preCheck.reason ?? 'PROVIDER_UNAVAILABLE_AFTER_PAYMENT'
    await dbUpdateRechargeAttempt(attempt.id, { status: 'failed', error: errMsg })
    await updateTransactionStatus(transactionId, 'completed', { error: errMsg })
    if (rechargeOrder) {
      await updateRechargeOrder(rechargeOrder.id, {
        status: 'provider_unavailable_after_payment',
        payment_status: 'completed',
        failure_reason: errMsg,
      })
    }

    await createAdminNotification({
      title: 'Recharge Failed after Payment',
      message: `Recharge order ${rechargeOrder?.id || transactionId} failed for phone ${input.mobileNumber} (amount: ${input.amount} ${input.currency || 'INR'}) due to provider pre-validation error: ${errMsg}`,
      type: 'recharge_failed_after_payment',
      details: { transactionId, rechargeOrderId: rechargeOrder?.id, phoneNumber: input.mobileNumber, error: errMsg }
    })

    return { ok: false, transactionId, status: 'failed', error: errMsg, hints }
  }

  console.log('[RECHARGE LOG] sending provider request', {
    providerId,
    adapterKey,
    payload: {
      phone: phoneDigits,
      providerPlanId: lockedCandidate.providerPlanId,
      externalId,
    },
  })

  const exec = await executeMappedRecharge(executionContext)

  console.log('[RECHARGE LOG] provider response', {
    ok: exec.ok,
    providerRef: exec.providerRef,
    error: exec.error,
    errorCode: exec.errorCode,
  })

  const attemptsLog = [
    {
      providerId,
      providerName: lockedCandidate.providerName || provider.name || providerId,
      providerPlanId: lockedCandidate.providerPlanId,
      cost: lockedCandidate.provider_wholesale_amount ?? lockedCandidate.price ?? 0,
      currency: lockedCandidate.provider_wholesale_currency ?? lockedCandidate.currency ?? null,
      source: routingDecision.routing_rule_matched ? ('RULE' as const) : ('LCR' as const),
      ok: exec.ok,
      error: exec.error,
      errorCode: exec.errorCode,
      errorMessage: exec.errorMessage,
      requestMethod: exec.requestAudit?.method,
      requestUrl: exec.requestAudit?.url,
      requestPath: exec.requestAudit?.path ?? exec.requestAudit?.url,
      requestBody: exec.requestAudit?.body,
    },
  ]

  if (exec.ok) {
    const providerName = lockedCandidate.providerName ?? provider.name ?? adapterKey
    const providerRef = exec.providerRef ?? externalId

    await dbUpdateRechargeAttempt(attempt.id, {
      status: 'success',
      selected_provider_id: providerId,
      selected_provider_plan_id: lockedCandidate.providerPlanId,
      provider_adapter: adapterKey,
      provider_ref: providerRef,
      provider_response: exec.raw,
      error: null,
      attempts: attemptsLog,
    })

    await insertDetailedRoutingLog({
      transactionId,
      countryCode,
      operatorCode,
      planId: input.planId,
      routingStrategy: routingDecision.routing_strategy,
      routingRuleMatched: routingDecision.routing_rule_matched ? 'Yes' : 'No',
      selectedProvider: providerId,
      providerPlanId: lockedCandidate.providerPlanId,
      ...candidatePricingLog(lockedCandidate),
      executionResult: 'RECHARGE_SUCCESS',
      attemptNumber: 1,
    }).catch(() => {})

    await updateTransactionStatus(transactionId, 'completed', {
      provider_used: providerId,
      provider_name: providerName,
      provider_ref: providerRef,
      provider_response: exec.raw,
      completed_at: new Date().toISOString(),
      post_payment_execution: true,
    })

    if (rechargeOrder) {
      await updateRechargeOrder(rechargeOrder.id, {
        status: 'completed',
        payment_status: 'completed',
        provider: providerName,
        provider_ref: providerRef,
        receive_amount: lockedCandidate.provider_wholesale_amount ?? lockedCandidate.price ?? null,
        receive_currency: (lockedCandidate.provider_wholesale_currency ?? lockedCandidate.currency) || null,
      })
    }

    await processRewardsForTransaction(transactionId).catch((err) => {
      console.error('[REWARDS] Failed to process rewards:', err)
    })

    const rewardPointsEarned = await getEarnedPoints(transactionId).catch(() => 0)

    return {
      ok: true,
      transactionId,
      rechargeOrderId: rechargeOrder?.id,
      providerRef,
      providerName,
      providerCode: lockedCandidate.providerCode,
      status: 'success',
      hints,
      rewardPointsEarned,
    }
  }

  await dbUpdateRechargeAttempt(attempt.id, {
    status: 'failed',
    error: exec.error ?? 'RECHARGE_FAILED',
    attempts: attemptsLog,
  })

  await insertDetailedRoutingLog({
    transactionId,
    countryCode,
    operatorCode,
    planId: input.planId,
    routingStrategy: routingDecision.routing_strategy,
    selectedProvider: providerId,
    ...candidatePricingLog(lockedCandidate),
    executionResult: 'RECHARGE_FAILED',
    failureReason: exec.error,
    responseCode: exec.errorCode,
    responseMessage: exec.errorMessage,
  }).catch(() => {})

  await updateTransactionStatus(transactionId, 'completed', { error: exec.error })
  if (rechargeOrder) {
    await updateRechargeOrder(rechargeOrder.id, { 
      status: 'failed', 
      payment_status: 'completed', 
      failure_reason: exec.error 
    })
  }

  await createAdminNotification({
    title: 'Recharge Failed after Payment',
    message: `Recharge order ${rechargeOrder?.id || transactionId} failed for phone ${input.mobileNumber} (amount: ${input.amount} ${input.currency || 'INR'}) due to provider execution error: ${exec.error || 'Unknown Error'}`,
    type: 'recharge_failed_after_payment',
    details: { transactionId, rechargeOrderId: rechargeOrder?.id, phoneNumber: input.mobileNumber, error: exec.error, errorCode: exec.errorCode }
  })

  return {
    ok: false,
    transactionId,
    rechargeOrderId: rechargeOrder?.id,
    status: 'failed',
    error: exec.error ?? 'Recharge failed',
    hints,
  }
}
