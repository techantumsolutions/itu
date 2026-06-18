import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { routeInternalPlan } from '@/lib/lcr-v2/routing'
import { executeMappedRecharge } from '@/lib/lcr-v2/execute-provider'
import {
  dbFindMappingsByProviderPlanId,
  dbFindRechargeByIdempotencyKey,
  dbGetInternalPlan,
  dbGetProvider,
  dbInsertRechargeAttempt,
  dbUpdateRechargeAttempt,
} from '@/lib/lcr-v2/recharge-db'
import { aggResolveInternalPlanIdForSystemPlan } from '@/lib/aggregator/repository'
import { insertDetailedRoutingLog, getMappingCount } from '@/lib/routing/repository'

export type LcrV2RechargeBody = {
  systemPlanId?: string
  internalPlanId?: string
  skuCode?: string
  phoneNumber: string
  sendAmount?: number
  countryCode?: string
  carrierCode?: string
  carrierName?: string
  productName?: string
  receiveCurrency?: string
  receiveAmount?: number
  idempotencyKey?: string
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '')
}

async function audit(action: string, entityId: string, details: unknown) {
  await supabaseRest('lcr_audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      actor: 'lcr-v2',
      action,
      entity_type: 'recharge',
      entity_id: entityId,
      details: details as object,
    }),
  }).catch(() => {})
}

export async function processLcrV2Recharge(request: Request, body: LcrV2RechargeBody) {
  const hints: string[] = []
  const logHint = (msg: string) => {
    const formatted = `[RECHARGE HINT] ${msg}`
    console.log(formatted)
    hints.push(formatted)
  }

  if (!isSupabaseCatalogConfigured()) {
    logHint('Supabase not configured for LCR v2')
    return { ok: false as const, status: 503, error: 'Supabase not configured for LCR v2', hints }
  }

  const idemHeader = request.headers.get('idempotency-key')?.trim()
  const idem = (idemHeader || body.idempotencyKey || '').trim() || null

  if (idem) {
    const existing = await dbFindRechargeByIdempotencyKey(idem)
    if (existing?.status === 'success') {
      logHint(`Idempotent request matches existing successful transaction: ${existing.distributor_ref}`)
      return { ok: true as const, status: 200, cached: true, attempt: existing, hints }
    }
    if (existing?.status === 'processing') {
      logHint(`Idempotent request is already in progress: ${existing.distributor_ref}`)
      return { ok: false as const, status: 409, error: 'Idempotent request already in progress', hints }
    }
  }

  let internalPlanId = (body.internalPlanId || '').trim()
  const systemPlanId = (body.systemPlanId || '').trim()
  if (!internalPlanId && systemPlanId) {
    internalPlanId = (await aggResolveInternalPlanIdForSystemPlan(systemPlanId)) ?? ''
  }
  if (!internalPlanId && body.skuCode) {
    const maps = await dbFindMappingsByProviderPlanId(String(body.skuCode).trim())
    internalPlanId = maps[0]?.internal_plan_id ?? ''
  }

  if (!internalPlanId) {
    logHint('Validation failed: systemPlanId, internalPlanId, or mapped skuCode is required')
    return { ok: false as const, status: 400, error: 'systemPlanId, internalPlanId, or mapped skuCode is required for LCR v2', hints }
  }

  const plan = await dbGetInternalPlan(internalPlanId)
  if (!plan) {
    logHint(`Validation failed: Internal plan not found for ID ${internalPlanId}`)
    return { ok: false as const, status: 404, error: 'Internal plan not found', hints }
  }

  const phoneDigits = digitsOnly(body.phoneNumber)
  if (phoneDigits.length < 8) {
    logHint(`Validation failed: Phone number ${body.phoneNumber} has too few digits`)
    return { ok: false as const, status: 400, error: 'Invalid phone number', hints }
  }

  const distributorRef = `TUG-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`

  logHint(`Recharge process initiated. Recipient: ${phoneDigits}, Plan: ${plan.uti_plan_name} (${internalPlanId}), Amount: ${body.sendAmount}`)

  const decision = await routeInternalPlan({
    internalPlanId,
    countryIso3: plan.country_iso3,
    operatorRef: plan.operator_ref,
    service: plan.service,
    productType: plan.category,
    transactionId: distributorRef,
    transactionAmount: body.sendAmount,
  })

  logHint(`Routing rules processed. Applied rule: ${decision.ruleApplied} (Rule Name: ${decision.ruleName || 'None'}, Rule ID: ${decision.ruleId || 'None'})`)

  // Log LCR_STARTED
  await insertDetailedRoutingLog({
    transactionId: distributorRef,
    countryCode: plan.country_iso3 ?? '',
    operatorCode: plan.operator_ref ?? '',
    planId: internalPlanId,
    routingStrategy: decision.settings?.routingStrategy || 'LEAST_COST',
    routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
    executionResult: 'LCR_STARTED',
  })

  // For every candidate evaluated, log the discovered/filtered status
  const evaluated_providers = (decision.evaluated || []).map((e: any) => {
    const isFiltered = !e.eligible
    const filterReason = e.filterReason || e.reason || (e.eligible ? 'ELIGIBLE' : 'PRICE_MISSING')
    
    // Log candidate status
    void insertDetailedRoutingLog({
      transactionId: distributorRef,
      countryCode: plan.country_iso3 ?? '',
      operatorCode: plan.operator_ref ?? '',
      planId: internalPlanId,
      routingStrategy: decision.settings?.routingStrategy || 'LEAST_COST',
      routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
      selectedProvider: e.providerId,
      providerCost: e.price !== Infinity ? e.price : undefined,
      providerPriority: e.providerPriority,
      executionResult: isFiltered ? 'LCR_PROVIDER_FILTERED' : 'LCR_PROVIDER_DISCOVERED',
      failureReason: isFiltered ? filterReason : undefined,
    }).catch(() => {})

    return {
      providerId: e.providerId,
      providerName: e.providerName || e.providerId,
      activeStatus: e.activeStatus ?? e.eligible,
      onlineStatus: e.onlineStatus ?? 'unknown',
      mappingExists: e.mappingExists ?? true,
      costPrice: e.price,
      currency: e.currency ?? null,
      margin: e.margin ?? 0,
      priority: e.providerPriority ?? 100,
      eligibility: e.eligible,
      filterReason,
    }
  })

  if (!decision.selected) {
    logHint(`Provider Assignment FAILED: No eligible provider mapping found for this plan.`)
    const reason = decision.routing_decision_reason || 'NO_ELIGIBLE_PROVIDER'
    await insertDetailedRoutingLog({
      transactionId: distributorRef,
      countryCode: plan.country_iso3 ?? '',
      operatorCode: plan.operator_ref ?? '',
      planId: internalPlanId,
      routingStrategy: decision.settings?.routingStrategy || 'LEAST_COST',
      routingRuleMatched: 'No',
      executionResult: reason,
    })
    return { ok: false as const, status: 400, error: 'No eligible provider mapping for this plan', decision, hints }
  }

  logHint(`Primary Provider Assigned: ${decision.selected.providerName || decision.selected.providerId} (Plan SKU: ${decision.selected.providerPlanId}, Cost: ${decision.selected.price} ${decision.selected.currency || 'EUR'})`)

  const retrySettings = decision.settings
  const maxHops =
    retrySettings?.retryEnabled === false
      ? 1
      : 1 + Math.max(0, retrySettings?.retryAttempts ?? decision.fallbacks.length)

  const candidate_provider_count = evaluated_providers.filter((e: any) => e.mappingExists !== false).length
  const eligible_provider_count = evaluated_providers.filter((e: any) => e.eligibility).length
  const filtered_provider_count = candidate_provider_count - eligible_provider_count
  const routingDecisionReason = decision.routing_decision_reason || (decision.routingType === 'RULE' ? 'RULE_MATCHED' : 'LEAST_COST_SELECTED')

  const snapshot = {
    transaction_id: distributorRef,
    internal_plan_id: internalPlanId,
    routing_strategy: retrySettings?.routingStrategy || 'LEAST_COST',
    routing_rule_matched: decision.routingType === 'RULE',
    routing_rule_id: decision.ruleId || null,
    routing_rule_provider: decision.routingType === 'RULE' ? (decision.selected?.providerName || decision.selected?.providerId || null) : null,
    candidate_provider_count,
    eligible_provider_count,
    filtered_provider_count,
    selected_provider: decision.selected?.providerName || decision.selected?.providerId || null,
    fallback_queue: decision.fallbacks.map((f: any) => f.providerName || f.providerId),
    routing_decision_reason: routingDecisionReason,
    evaluated_providers,
    // Integrity check parameters
    internal_plan_id_verify: internalPlanId,
    mapping_count: decision.mapping_count ?? candidate_provider_count,
  }

  // Persist a complete routing decision snapshot before Attempt #1 begins
  const attempt = await dbInsertRechargeAttempt({
    idempotencyKey: idem,
    distributorRef,
    internalPlanId,
    phoneNumber: phoneDigits,
    sendAmount: body.sendAmount,
    currency: body.receiveCurrency ?? undefined,
    routingDecision: snapshot,
  })

  let chain = [
    decision.selected,
    ...(retrySettings?.autoFailover === false ? [] : decision.fallbacks),
  ].filter(Boolean) as Array<{
    providerId: string
    providerPlanId: string
    providerCode?: string
    providerName?: string
    price?: number
    currency?: string
    providerPriority?: number
  }>

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

  for (let i = 0; i < chain.length; i++) {
    const hop = chain[i]

    // Check if provider has failed previously in the chain (failover protection)
    const alreadyFailed = attemptsLog.some((a) => a.providerId === hop.providerId)
    if (alreadyFailed) {
      logHint(`[Hop ${i + 1}] Skipping provider ${hop.providerName || hop.providerId} because it has already failed in this transaction chain.`)
      continue
    }

    const currentSource = (i === 0 && decision.routingType === 'RULE') ? 'RULE' : 'LCR'

    // Log attempt start events
    if (currentSource === 'RULE') {
      await insertDetailedRoutingLog({
        transactionId: distributorRef,
        countryCode: plan.country_iso3 ?? '',
        operatorCode: plan.operator_ref ?? '',
        planId: internalPlanId,
        routingStrategy: snapshot.routing_strategy,
        routingRuleMatched: 'Yes',
        routingRuleId: decision.ruleId,
        routingRuleProvider: hop.providerName || hop.providerId,
        selectedProvider: hop.providerId,
        providerCost: hop.price,
        providerPriority: hop.providerPriority,
        executionResult: 'RULE_PROVIDER_SELECTED',
        attemptNumber: i + 1,
      })
    } else {
      await insertDetailedRoutingLog({
        transactionId: distributorRef,
        countryCode: plan.country_iso3 ?? '',
        operatorCode: plan.operator_ref ?? '',
        planId: internalPlanId,
        routingStrategy: snapshot.routing_strategy,
        routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
        selectedProvider: hop.providerId,
        providerCost: hop.price,
        providerPriority: hop.providerPriority,
        executionResult: 'RETRY_STARTED',
        attemptNumber: i + 1,
      })
      await insertDetailedRoutingLog({
        transactionId: distributorRef,
        countryCode: plan.country_iso3 ?? '',
        operatorCode: plan.operator_ref ?? '',
        planId: internalPlanId,
        routingStrategy: snapshot.routing_strategy,
        routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
        selectedProvider: hop.providerId,
        providerCost: hop.price,
        providerPriority: hop.providerPriority,
        executionResult: 'RETRY_PROVIDER_SELECTED',
        attemptNumber: i + 1,
      })
    }

    logHint(`[Hop ${i + 1}/${chain.length}] Attempting provider: ${hop.providerName || hop.providerId} (Plan SKU: ${hop.providerPlanId}, Cost: ${hop.price ?? 'N/A'} ${hop.currency || 'EUR'})`)

    const prov = await dbGetProvider(hop.providerId)
    if (!prov) {
      logHint(`[Hop ${i + 1}/${chain.length}] Provider configuration not found for ID ${hop.providerId}`)
      attemptsLog.push({ 
        providerId: hop.providerId, 
        providerName: hop.providerId,
        providerPlanId: hop.providerPlanId, 
        cost: hop.price ?? 0,
        source: currentSource,
        ok: false, 
        error: 'PROVIDER_NOT_FOUND' 
      })
      continue
    }

    const adapterKey = String(prov.adapter_key || '').toLowerCase()
    logHint(`[Hop ${i + 1}/${chain.length}] Sending request to provider adapter "${adapterKey}" with DistributorRef: ${distributorRef}`)

    const exec = await executeMappedRecharge({
      adapterKey,
      providerPlanId: hop.providerPlanId,
      phoneDigits,
      externalId: distributorRef,
      sendAmount: body.sendAmount,
    })

    logHint(`[Hop ${i + 1}/${chain.length}] Response status: ${exec.ok ? 'SUCCESS' : 'FAILED'}${exec.error ? ` | Error: ${exec.error}` : ''}`)

    attemptsLog.push({
      providerId: hop.providerId,
      providerName: hop.providerName || prov.name || hop.providerId,
      providerPlanId: hop.providerPlanId,
      cost: hop.price ?? 0,
      source: currentSource,
      ok: exec.ok,
      error: exec.error,
      errorCode: exec.errorCode,
      errorMessage: exec.errorMessage,
    })

    await dbUpdateRechargeAttempt(attempt.id, { attempts: attemptsLog })

    if (exec.ok) {
      logHint(`Recharge completed successfully via provider ${hop.providerName || hop.providerId} on hop ${i + 1}. Provider Reference: ${exec.providerRef || 'N/A'}`)

      await dbUpdateRechargeAttempt(attempt.id, {
        status: 'success',
        selected_provider_id: hop.providerId,
        selected_provider_plan_id: hop.providerPlanId,
        provider_adapter: adapterKey,
        provider_ref: exec.providerRef ?? null,
        provider_response: exec.raw ?? null,
        error: null,
      })

      // Log RECHARGE_SUCCESS
      await insertDetailedRoutingLog({
        transactionId: distributorRef,
        countryCode: plan.country_iso3 ?? '',
        operatorCode: plan.operator_ref ?? '',
        planId: internalPlanId,
        routingStrategy: snapshot.routing_strategy,
        routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
        selectedProvider: hop.providerId,
        providerPlanId: hop.providerPlanId,
        providerCost: hop.price,
        providerCurrency: hop.currency ?? null,
        userAmount: body.sendAmount ?? null,
        userCurrency: body.receiveCurrency ?? null,
        providerPriority: hop.providerPriority,
        executionResult: 'RECHARGE_SUCCESS',
        attemptNumber: i + 1,
      })

      // Provider Candidate Consistency Check
      const presentInSnapshot = evaluated_providers.some((ep) => ep.providerId === hop.providerId && ep.eligibility)
      if (!presentInSnapshot) {
        console.error(`[ROUTING ERROR] INCONSISTENT_PROVIDER_RESOLUTION: Executed provider ${hop.providerId} was not eligible or present in the routing decision snapshot.`)
        await insertDetailedRoutingLog({
          transactionId: distributorRef,
          countryCode: plan.country_iso3 ?? '',
          operatorCode: plan.operator_ref ?? '',
          planId: internalPlanId,
          routingStrategy: snapshot.routing_strategy,
          routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
          selectedProvider: hop.providerId,
          providerCost: hop.price,
          providerPriority: hop.providerPriority,
          executionResult: 'INCONSISTENT_PROVIDER_RESOLUTION',
          attemptNumber: i + 1,
          failureReason: `Executed: ${hop.providerName || hop.providerId} | Routing Selected: ${snapshot.selected_provider}`,
        })
      }

      await audit('recharge.success', attempt.id, { distributorRef, attempts: attemptsLog })
      return {
        ok: true as const,
        status: 200,
        attemptId: attempt.id,
        distributorRef,
        decision,
        attempts: attemptsLog,
        providerRef: exec.providerRef,
        raw: exec.raw,
        internalPlan: plan,
        selectedProviderPlanId: hop.providerPlanId,
        hints,
      }
    } else {
      logHint(`[Hop ${i + 1}/${chain.length}] Failover triggered due to failure.`)
      // Record failure detail logs
      if (currentSource === 'RULE') {
        await insertDetailedRoutingLog({
          transactionId: distributorRef,
          countryCode: plan.country_iso3 ?? '',
          operatorCode: plan.operator_ref ?? '',
          planId: internalPlanId,
          routingStrategy: snapshot.routing_strategy,
          routingRuleMatched: 'Yes',
          routingRuleId: decision.ruleId,
          routingRuleProvider: hop.providerName || hop.providerId,
          selectedProvider: hop.providerId,
          providerCost: hop.price,
          providerPriority: hop.providerPriority,
          executionResult: 'RULE_PROVIDER_FAILED',
          attemptNumber: i + 1,
          failureReason: exec.error || 'RULE_PROVIDER_FAILED',
          responseCode: exec.errorCode,
          responseMessage: exec.errorMessage,
        })
      } else {
        await insertDetailedRoutingLog({
          transactionId: distributorRef,
          countryCode: plan.country_iso3 ?? '',
          operatorCode: plan.operator_ref ?? '',
          planId: internalPlanId,
          routingStrategy: snapshot.routing_strategy,
          routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
          selectedProvider: hop.providerId,
          providerCost: hop.price,
          providerPriority: hop.providerPriority,
          executionResult: 'RETRY_FAILOVER',
          attemptNumber: i + 1,
          failureReason: exec.error || 'RETRY_FAILOVER',
          responseCode: exec.errorCode,
          responseMessage: exec.errorMessage,
        })
      }
    }
  }

  logHint(`Recharge process FAILED. All tried providers failed: ${JSON.stringify(attemptsLog)}`)

  await dbUpdateRechargeAttempt(attempt.id, {
    status: 'failed',
    error: 'ALL_PROVIDERS_FAILED',
    attempts: attemptsLog,
  })

  const lastAttemptCost =
    attemptsLog.length > 0
      ? attemptsLog[attemptsLog.length - 1]?.cost
      : decision.selected?.price

  // Log MAX_RETRY_EXCEEDED and RECHARGE_FAILED
  await insertDetailedRoutingLog({
    transactionId: distributorRef,
    countryCode: plan.country_iso3 ?? '',
    operatorCode: plan.operator_ref ?? '',
    planId: internalPlanId,
    routingStrategy: snapshot.routing_strategy,
    routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
    selectedProvider: decision.selected?.providerId,
    providerCost: lastAttemptCost,
    executionResult: 'MAX_RETRY_EXCEEDED',
    failureReason: 'All providers failed in failover chain',
  })
  await insertDetailedRoutingLog({
    transactionId: distributorRef,
    countryCode: plan.country_iso3 ?? '',
    operatorCode: plan.operator_ref ?? '',
    planId: internalPlanId,
    routingStrategy: snapshot.routing_strategy,
    routingRuleMatched: decision.routingType === 'RULE' ? 'Yes' : 'No',
    selectedProvider: decision.selected?.providerId,
    providerCost: lastAttemptCost,
    executionResult: 'RECHARGE_FAILED',
    failureReason: 'All providers failed',
  })

  await audit('recharge.failed', attempt.id, { distributorRef, attempts: attemptsLog })

  return {
    ok: false as const,
    status: 502,
    error: 'All providers failed',
    decision: { ...decision, systemPlanId: systemPlanId || undefined },
    attempts: attemptsLog,
    attemptId: attempt.id,
    distributorRef,
    hints,
  }
}

export function lcrV2AttemptToApiOrder(input: {
  attempt: {
    distributor_ref: string
    phone_number: string
    send_amount: number | null
    currency: string | null
    status: string
    provider_ref: string | null
    routing_decision: unknown
    internal_plan_id: string
    selected_provider_plan_id?: string | null
  }
  internalPlan: { uti_plan_name?: string; uti_description?: string }
  skuCode: string
  extras?: Record<string, unknown>
}) {
  const serviceFee = 0.5
  const send = input.attempt.send_amount ?? 0
  return {
    id: input.attempt.distributor_ref,
    phoneNumber: input.attempt.phone_number,
    skuCode: input.skuCode || input.attempt.selected_provider_plan_id || '',
    productName: input.internalPlan.uti_plan_name,
    sendAmount: send,
    sendCurrency: input.attempt.currency || 'EUR',
    serviceFee,
    totalAmount: send + serviceFee,
    status: input.attempt.status === 'success' ? 'completed' : input.attempt.status,
    providerRef: input.attempt.provider_ref,
    distributorRef: input.attempt.distributor_ref,
    internalPlanId: input.attempt.internal_plan_id,
    routing: {
      lcrV2: true,
      decision: input.attempt.routing_decision,
      ...(input.extras ?? {}),
    },
  }
}
