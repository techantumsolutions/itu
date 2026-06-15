/**
 * Post-payment checkout service.
 *
 * After Razorpay payment is verified, this service:
 *   1. Creates a PENDING recharge transaction
 *   2. Executes the routing engine to select a provider
 *   3. Sends the recharge through the selected provider
 *   4. Updates all records with the result
 *
 * Does NOT modify the routing engine, LCR engine, or provider connectors.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import { resolveProvider, normalizeCountryToIso3, resolveSystemOperator } from '@/lib/routing/routing-engine-service'
import { executeMappedRecharge } from '@/lib/lcr-v2/execute-provider'
import { dbGetProvider, dbGetInternalPlan, dbInsertRechargeAttempt, dbUpdateRechargeAttempt } from '@/lib/lcr-v2/recharge-db'
import { insertDetailedRoutingLog } from '@/lib/routing/repository'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type CheckoutInput = {
  paymentOrderId: string
  planId: string
  mobileNumber: string
  operatorId: string
  countryId: string
  amount: number
  currency: string
  razorpayPaymentId: string
  userId?: string
}

export type CheckoutResult = {
  ok: boolean
  transactionId?: string
  rechargeOrderId?: string
  providerRef?: string
  providerName?: string
  providerCode?: string
  status: 'success' | 'failed'
  error?: string
  hints?: string[]
}

/** Insert a transaction row (status: pending). */
async function createTransaction(input: CheckoutInput): Promise<string | null> {
  const res = await supabaseRest('transactions?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        user_id: input.userId || null,
        type: 'recharge',
        amount: input.amount,
        currency: input.currency,
        status: 'pending',
        description: `Recharge ${input.mobileNumber}`,
        metadata: {
          plan_id: input.planId,
          mobile_number: input.mobileNumber,
          operator_id: input.operatorId,
          country_id: input.countryId,
          payment_order_id: input.paymentOrderId,
          razorpay_payment_id: input.razorpayPaymentId,
        },
      },
    ]),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

/** Insert a transaction_payments row linking transaction ↔ payment_order. */
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

/** Insert a recharge_orders row. */
async function createRechargeOrder(input: CheckoutInput & { transactionId: string; operatorName: string }): Promise<string | null> {
  const res = await supabaseRest('recharge_orders?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        user_id: input.userId || null,
        transaction_id: input.transactionId,
        phone_number: input.mobileNumber,
        operator_code: input.operatorId,
        operator_name: input.operatorName,
        country_iso: input.countryId,
        sku_code: input.planId,
        send_amount: input.amount,
        send_currency: input.currency,
        status: 'pending',
        metadata: {
          payment_order_id: input.paymentOrderId,
          razorpay_payment_id: input.razorpayPaymentId,
        },
      },
    ]),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

/** Update transaction status. */
async function updateTransactionStatus(id: string, status: string, meta?: Record<string, unknown>) {
  const payload: Record<string, unknown> = { status }
  if (meta) {
    // Merge metadata without overwriting existing fields
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

/** Update recharge_orders row. */
async function updateRechargeOrder(id: string, patch: Record<string, unknown>) {
  await supabaseRest(`recharge_orders?id=eq.${enc(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
}

/**
 * Execute the full post-payment checkout flow:
 * Payment verified → Create transaction → Route → Execute provider → Update status
 */
export async function executeCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const hints: string[] = []
  const logHint = (msg: string) => {
    const formatted = `[RECHARGE HINT] ${msg}`
    console.log(formatted)
    hints.push(formatted)
  }

  // Normalize country and operator upfront
  const normalizedCountryId = await normalizeCountryToIso3(input.countryId)
  const operatorInfo = await resolveSystemOperator(input.operatorId, normalizedCountryId)

  logHint(`Post-payment checkout initiated. Recipient: ${input.mobileNumber}, Plan: ${input.planId}, Amount: ${input.amount} ${input.currency}`)

  const normalizedInput: CheckoutInput = {
    ...input,
    countryId: normalizedCountryId,
    operatorId: operatorInfo.id,
  }

  // 1. Create PENDING transaction
  const transactionId = await createTransaction(normalizedInput)
  if (!transactionId) {
    logHint('Failed to create transaction record in database')
    return { ok: false, status: 'failed', error: 'Failed to create transaction record', hints }
  }

  logHint(`Created pending transaction: ${transactionId}`)

  // 2. Link transaction to payment
  await createTransactionPayment({
    transactionId,
    paymentOrderId: normalizedInput.paymentOrderId,
    gateway: 'razorpay',
    gatewayRef: normalizedInput.razorpayPaymentId,
    amount: normalizedInput.amount,
  })

  // 3. Create recharge order (PENDING)
  const rechargeOrderId = await createRechargeOrder({
    ...normalizedInput,
    transactionId,
    operatorName: operatorInfo.name,
  })
  logHint(`Created pending recharge order: ${rechargeOrderId || 'None'}`)

  // 4. Execute routing engine
  let routingResult
  try {
    routingResult = await resolveProvider({
      countryId: normalizedInput.countryId,
      operatorId: normalizedInput.operatorId,
      productId: normalizedInput.planId,
      transactionId,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Routing engine error'
    logHint(`Routing engine failed with error: ${errMsg}`)
    await updateTransactionStatus(transactionId, 'failed', { error: errMsg })
    if (rechargeOrderId) {
      await updateRechargeOrder(rechargeOrderId, { status: 'failed', failure_reason: errMsg })
    }
    return { ok: false, transactionId, rechargeOrderId: rechargeOrderId ?? undefined, status: 'failed', error: errMsg, hints }
  }

  logHint(`Routing rules processed. Applied rule: ${routingResult.ruleApplied} (Rule Name: ${routingResult.ruleName || 'None'}, Rule ID: ${routingResult.ruleId || 'None'})`)

  // Fetch plan details to log events
  const plan = await dbGetInternalPlan(normalizedInput.planId)
  const countryCode = plan?.country_iso3 ?? normalizedInput.countryId ?? ''
  const operatorCode = plan?.operator_ref ?? normalizedInput.operatorId ?? ''

  // For every candidate evaluated, log the discovered/filtered status
  const candidateLogWrites = (routingResult.evaluated || []).map(async (e: any) => {
    const isFiltered = !e.eligible
    const filterReason = e.filterReason || e.reason || (e.eligible ? 'ELIGIBLE' : 'PRICE_MISSING')

    await insertDetailedRoutingLog({
      transactionId,
      countryCode,
      operatorCode,
      planId: normalizedInput.planId,
      routingStrategy: routingResult.settings?.routingStrategy || 'LEAST_COST',
      routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
      selectedProvider: e.providerId,
      providerCost: e.price !== Infinity ? e.price : undefined,
      providerPriority: e.providerPriority,
      executionResult: isFiltered ? 'LCR_PROVIDER_FILTERED' : 'LCR_PROVIDER_DISCOVERED',
      failureReason: isFiltered ? filterReason : undefined,
    }).catch(() => {})
  })

  const evaluated_providers = (routingResult.evaluated || []).map((e: any) => {
    const isFiltered = !e.eligible
    const filterReason = e.filterReason || e.reason || (e.eligible ? 'ELIGIBLE' : 'PRICE_MISSING')

    return {
      providerId: e.providerId,
      providerName: e.providerName || e.providerId,
      activeStatus: e.activeStatus ?? e.eligible,
      onlineStatus: e.onlineStatus ?? 'unknown',
      mappingExists: e.mappingExists ?? true,
      costPrice: e.price,
      margin: e.margin ?? 0,
      priority: e.providerPriority ?? 100,
      eligibility: e.eligible,
      filterReason,
    }
  })

  await Promise.all(candidateLogWrites)

  if (!routingResult.selected) {
    const errMsg = 'No active provider available for this transaction'
    logHint(`Provider Assignment FAILED: No active provider available for this plan`)
    const reason = routingResult.routing_decision_reason || 'NO_ELIGIBLE_PROVIDER'
    const pricedCandidates = (routingResult.evaluated || []).filter(
      (e: any) => typeof e.price === 'number' && Number.isFinite(e.price) && e.price > 0,
    )
    const bestPricedCandidate = pricedCandidates.sort((a: any, b: any) => (b.price ?? 0) - (a.price ?? 0))[0]
    await insertDetailedRoutingLog({
      transactionId,
      countryCode,
      operatorCode,
      planId: normalizedInput.planId,
      routingStrategy: routingResult.settings?.routingStrategy || 'LEAST_COST',
      routingRuleMatched: 'No',
      selectedProvider: bestPricedCandidate?.providerId,
      providerCost: bestPricedCandidate?.price !== Infinity ? bestPricedCandidate?.price : undefined,
      executionResult: reason,
    })
    await updateTransactionStatus(transactionId, 'failed', { error: errMsg, routing: routingResult })
    if (rechargeOrderId) {
      await updateRechargeOrder(rechargeOrderId, { status: 'failed', failure_reason: errMsg })
    }
    return { ok: false, transactionId, rechargeOrderId: rechargeOrderId ?? undefined, status: 'failed', error: errMsg, hints }
  }

  logHint(`Primary Provider Assigned: ${routingResult.selected.providerName || routingResult.selected.providerId} (Plan SKU: ${routingResult.selected.providerPlanId}, Cost: ${routingResult.selected.price} ${routingResult.selected.currency || 'EUR'})`)

  const retrySettings = routingResult.settings
  const selected = routingResult.selected
  const fallbacks = routingResult.fallbacks ?? []
  const chain = [selected, ...fallbacks]

  const candidate_provider_count = evaluated_providers.filter((e: any) => e.mappingExists !== false).length
  const eligible_provider_count = evaluated_providers.filter((e: any) => e.eligibility).length
  const filtered_provider_count = candidate_provider_count - eligible_provider_count
  const routingDecisionReason = routingResult.routing_decision_reason || (routingResult.routingType === 'RULE' ? 'RULE_MATCHED' : 'LEAST_COST_SELECTED')

  const snapshot = {
    transaction_id: transactionId,
    internal_plan_id: normalizedInput.planId,
    routing_strategy: retrySettings?.routingStrategy || 'LEAST_COST',
    routing_rule_matched: routingResult.routingType === 'RULE',
    routing_rule_id: routingResult.ruleId || null,
    routing_rule_provider: routingResult.routingType === 'RULE' ? (routingResult.selected?.providerName || routingResult.selected?.providerId || null) : null,
    candidate_provider_count,
    eligible_provider_count,
    filtered_provider_count,
    selected_provider: routingResult.selected?.providerName || routingResult.selected?.providerId || null,
    fallback_queue: routingResult.fallbacks.map((f: any) => f.providerName || f.providerId),
    routing_decision_reason: routingDecisionReason,
    evaluated_providers,
    // Integrity check parameters
    internal_plan_id_verify: normalizedInput.planId,
    mapping_count: routingResult.mapping_count ?? candidate_provider_count,
  }

  // Persist a complete routing decision snapshot before Attempt #1 begins
  const attempt = await dbInsertRechargeAttempt({
    idempotencyKey: input.razorpayPaymentId || null,
    distributorRef: transactionId,
    internalPlanId: normalizedInput.planId,
    phoneNumber: normalizedInput.mobileNumber.replace(/\D/g, ''),
    sendAmount: input.amount,
    currency: input.currency || 'INR',
    routingDecision: snapshot,
  }).catch((e) => {
    console.error('Failed to insert recharge attempt snapshot:', e)
    return null
  })

  logHint(`Provider failover chain established. Trying providers: ${chain.map(c => `${c.providerName || c.providerId} (Cost: ${c.price ?? 'N/A'} ${c.currency || 'EUR'})`).join(' -> ')}`)

  const attemptsLog: Array<{ 
    providerId: string
    providerName: string
    providerPlanId: string
    cost: number
    source: 'RULE' | 'LCR'
    ok: boolean
    error?: string
    errorCode?: string
    errorMessage?: string
  }> = []

  // Try providers in routing order (primary + fallbacks)
  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i]

    // Check if provider has failed previously in the chain (failover protection)
    const alreadyFailed = attemptsLog.some((a) => a.providerId === candidate.providerId)
    if (alreadyFailed) {
      logHint(`[Hop ${i + 1}/${chain.length}] Skipping provider ${candidate.providerName || candidate.providerId} because it has already failed in this transaction chain.`)
      continue
    }

    const currentSource = (i === 0 && routingResult.routingType === 'RULE') ? 'RULE' : 'LCR'

    // Log attempt start events
    if (currentSource === 'RULE') {
      await insertDetailedRoutingLog({
        transactionId,
        countryCode,
        operatorCode,
        planId: normalizedInput.planId,
        routingStrategy: snapshot.routing_strategy,
        routingRuleMatched: 'Yes',
        routingRuleId: routingResult.ruleId,
        routingRuleProvider: candidate.providerName || candidate.providerId,
        selectedProvider: candidate.providerId,
        providerCost: candidate.price,
        providerPriority: candidate.providerPriority,
        executionResult: 'RULE_PROVIDER_SELECTED',
        attemptNumber: i + 1,
      })
    } else {
      await insertDetailedRoutingLog({
        transactionId,
        countryCode,
        operatorCode,
        planId: normalizedInput.planId,
        routingStrategy: snapshot.routing_strategy,
        routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
        selectedProvider: candidate.providerId,
        providerCost: candidate.price,
        providerPriority: candidate.providerPriority,
        executionResult: 'RETRY_STARTED',
        attemptNumber: i + 1,
      })
      await insertDetailedRoutingLog({
        transactionId,
        countryCode,
        operatorCode,
        planId: normalizedInput.planId,
        routingStrategy: snapshot.routing_strategy,
        routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
        selectedProvider: candidate.providerId,
        providerCost: candidate.price,
        providerPriority: candidate.providerPriority,
        executionResult: 'RETRY_PROVIDER_SELECTED',
        attemptNumber: i + 1,
      })
    }

    logHint(`[Hop ${i + 1}/${chain.length}] Attempting provider: ${candidate.providerName || candidate.providerId} (Plan SKU: ${candidate.providerPlanId}, Cost: ${candidate.price ?? 'N/A'} ${candidate.currency || 'EUR'})`)

    const provider = await dbGetProvider(candidate.providerId)
    if (!provider) {
      logHint(`[Hop ${i + 1}/${chain.length}] Provider configuration not found for ID ${candidate.providerId}`)
      attemptsLog.push({ 
        providerId: candidate.providerId, 
        providerName: candidate.providerId,
        providerPlanId: candidate.providerPlanId, 
        cost: candidate.price ?? 0,
        source: currentSource,
        ok: false, 
        error: 'PROVIDER_NOT_FOUND' 
      })
      if (attempt) {
        await dbUpdateRechargeAttempt(attempt.id, { attempts: attemptsLog }).catch(() => {})
      }
      continue
    }

    const adapterKey = String(provider.adapter_key || '').toLowerCase()
    const phoneDigits = input.mobileNumber.replace(/\D/g, '')
    const externalId = `TXN-${transactionId.slice(0, 8).toUpperCase()}-${Date.now()}`

    logHint(`[Hop ${i + 1}/${chain.length}] Sending request to provider adapter "${adapterKey}" with ExternalRef: ${externalId}`)

    const exec = await executeMappedRecharge({
      adapterKey,
      providerPlanId: candidate.providerPlanId,
      phoneDigits,
      externalId,
      sendAmount: input.amount,
    })

    logHint(`[Hop ${i + 1}/${chain.length}] Response status: ${exec.ok ? 'SUCCESS' : 'FAILED'}${exec.error ? ` | Error: ${exec.error}` : ''}`)

    attemptsLog.push({
      providerId: candidate.providerId,
      providerName: candidate.providerName || provider.name || candidate.providerId,
      providerPlanId: candidate.providerPlanId,
      cost: candidate.price ?? 0,
      source: currentSource,
      ok: exec.ok,
      error: exec.error,
      errorCode: exec.errorCode,
      errorMessage: exec.errorMessage,
    })

    if (attempt) {
      await dbUpdateRechargeAttempt(attempt.id, { attempts: attemptsLog }).catch(() => {})
    }

    if (exec.ok) {
      const providerName = candidate.providerName ?? provider.name ?? candidate.providerCode ?? adapterKey
      const providerRef = exec.providerRef ?? externalId

      logHint(`Recharge completed successfully via provider ${providerName} on hop ${i + 1}. Provider Reference: ${providerRef}`)

      if (attempt) {
        await dbUpdateRechargeAttempt(attempt.id, {
          status: 'success',
          selected_provider_id: candidate.providerId,
          selected_provider_plan_id: candidate.providerPlanId,
          provider_adapter: adapterKey,
          provider_ref: providerRef,
          provider_response: exec.raw,
          error: null,
        }).catch(() => {})
      }

      await insertDetailedRoutingLog({
        transactionId,
        countryCode,
        operatorCode,
        planId: normalizedInput.planId,
        routingStrategy: snapshot.routing_strategy,
        routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
        selectedProvider: candidate.providerId,
        providerCost: candidate.price,
        providerPriority: candidate.providerPriority,
        executionResult: 'RECHARGE_SUCCESS',
        attemptNumber: i + 1,
      })

      // Provider Candidate Consistency Check
      const presentInSnapshot = evaluated_providers.some((ep) => ep.providerId === candidate.providerId && ep.eligibility)
      if (!presentInSnapshot) {
        console.error(`[ROUTING ERROR] INCONSISTENT_PROVIDER_RESOLUTION: Executed provider ${candidate.providerId} was not eligible or present in the routing decision snapshot.`)
        await insertDetailedRoutingLog({
          transactionId,
          countryCode,
          operatorCode,
          planId: normalizedInput.planId,
          routingStrategy: snapshot.routing_strategy,
          routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
          selectedProvider: candidate.providerId,
          providerCost: candidate.price,
          providerPriority: candidate.providerPriority,
          executionResult: 'INCONSISTENT_PROVIDER_RESOLUTION',
          attemptNumber: i + 1,
          failureReason: `Executed: ${providerName} | Routing Selected: ${snapshot.selected_provider}`,
        })
      }

      await updateTransactionStatus(transactionId, 'completed', {
        provider_used: candidate.providerId,
        provider_code: candidate.providerCode,
        provider_name: providerName,
        provider_ref: providerRef,
        provider_response: exec.raw,
        routing_type: routingResult.routingType,
        completed_at: new Date().toISOString(),
      })

      if (rechargeOrderId) {
        await updateRechargeOrder(rechargeOrderId, {
          status: 'completed',
          provider: providerName,
          provider_ref: providerRef,
          metadata: {
            payment_order_id: input.paymentOrderId,
            razorpay_payment_id: input.razorpayPaymentId,
            provider_response: exec.raw,
            routing_type: routingResult.routingType,
          },
        })
      }

      return {
        ok: true,
        transactionId,
        rechargeOrderId: rechargeOrderId ?? undefined,
        providerRef,
        providerName,
        providerCode: candidate.providerCode,
        status: 'success',
        hints,
      }
    } else {
      logHint(`[Hop ${i + 1}/${chain.length}] Failover triggered due to failure.`)
      // Record failure detail logs
      if (currentSource === 'RULE') {
        await insertDetailedRoutingLog({
          transactionId,
          countryCode,
          operatorCode,
          planId: normalizedInput.planId,
          routingStrategy: snapshot.routing_strategy,
          routingRuleMatched: 'Yes',
          routingRuleId: routingResult.ruleId,
          routingRuleProvider: candidate.providerName || candidate.providerId,
          selectedProvider: candidate.providerId,
          providerCost: candidate.price,
          providerPriority: candidate.providerPriority,
          executionResult: 'RULE_PROVIDER_FAILED',
          attemptNumber: i + 1,
          failureReason: exec.error || 'RULE_PROVIDER_FAILED',
          responseCode: exec.errorCode,
          responseMessage: exec.errorMessage,
        })
      } else {
        await insertDetailedRoutingLog({
          transactionId,
          countryCode,
          operatorCode,
          planId: normalizedInput.planId,
          routingStrategy: snapshot.routing_strategy,
          routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
          selectedProvider: candidate.providerId,
          providerCost: candidate.price,
          providerPriority: candidate.providerPriority,
          executionResult: 'RETRY_FAILOVER',
          attemptNumber: i + 1,
          failureReason: exec.error || 'RETRY_FAILOVER',
          responseCode: exec.errorCode,
          responseMessage: exec.errorMessage,
        })
      }
    }
  }

  // 7. All providers failed
  const errMsg = 'All providers failed to process the recharge'
  logHint(`Recharge process FAILED. All tried providers failed: ${JSON.stringify(attemptsLog)}`)

  if (attempt) {
    await dbUpdateRechargeAttempt(attempt.id, {
      status: 'failed',
      error: 'ALL_PROVIDERS_FAILED',
      attempts: attemptsLog,
    }).catch(() => {})
  }

  // Log MAX_RETRY_EXCEEDED and RECHARGE_FAILED
  const lastAttemptCost =
    attemptsLog.length > 0
      ? attemptsLog[attemptsLog.length - 1]?.cost
      : routingResult.selected?.price

  await insertDetailedRoutingLog({
    transactionId,
    countryCode,
    operatorCode,
    planId: normalizedInput.planId,
    routingStrategy: snapshot.routing_strategy,
    routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
    selectedProvider: routingResult.selected?.providerId,
    providerCost: lastAttemptCost,
    executionResult: 'MAX_RETRY_EXCEEDED',
    failureReason: 'All providers failed in failover chain',
  })
  await insertDetailedRoutingLog({
    transactionId,
    countryCode,
    operatorCode,
    planId: normalizedInput.planId,
    routingStrategy: snapshot.routing_strategy,
    routingRuleMatched: routingResult.routingType === 'RULE' ? 'Yes' : 'No',
    selectedProvider: routingResult.selected?.providerId,
    providerCost: lastAttemptCost,
    executionResult: 'RECHARGE_FAILED',
    failureReason: 'All providers failed',
  })

  await updateTransactionStatus(transactionId, 'failed', { error: errMsg, routing: routingResult })
  if (rechargeOrderId) {
    await updateRechargeOrder(rechargeOrderId, { status: 'failed', failure_reason: errMsg })
  }

  return { ok: false, transactionId, rechargeOrderId: rechargeOrderId ?? undefined, status: 'failed', error: errMsg, hints }
}
