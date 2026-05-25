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

export type LcrV2RechargeBody = {
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
  if (!isSupabaseCatalogConfigured()) {
    return { ok: false as const, status: 503, error: 'Supabase not configured for LCR v2' }
  }

  const idemHeader = request.headers.get('idempotency-key')?.trim()
  const idem = (idemHeader || body.idempotencyKey || '').trim() || null

  if (idem) {
    const existing = await dbFindRechargeByIdempotencyKey(idem)
    if (existing?.status === 'success') {
      return { ok: true as const, status: 200, cached: true, attempt: existing }
    }
    if (existing?.status === 'processing') {
      return { ok: false as const, status: 409, error: 'Idempotent request already in progress' }
    }
  }

  let internalPlanId = (body.internalPlanId || '').trim()
  if (!internalPlanId && body.skuCode) {
    const maps = await dbFindMappingsByProviderPlanId(String(body.skuCode).trim())
    internalPlanId = maps[0]?.internal_plan_id ?? ''
  }

  if (!internalPlanId) {
    return { ok: false as const, status: 400, error: 'internalPlanId or mapped skuCode is required for LCR v2' }
  }

  const plan = await dbGetInternalPlan(internalPlanId)
  if (!plan) {
    return { ok: false as const, status: 404, error: 'Internal plan not found' }
  }

  const phoneDigits = digitsOnly(body.phoneNumber)
  if (phoneDigits.length < 8) {
    return { ok: false as const, status: 400, error: 'Invalid phone number' }
  }

  const decision = await routeInternalPlan({
    internalPlanId,
    countryIso3: plan.country_iso3,
    operatorRef: plan.operator_ref,
    service: plan.service,
  })

  if (!decision.selected) {
    return { ok: false as const, status: 400, error: 'No eligible provider mapping for this plan', decision }
  }

  const distributorRef = `TUG-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`

  const attempt = await dbInsertRechargeAttempt({
    idempotencyKey: idem,
    distributorRef,
    internalPlanId,
    phoneNumber: phoneDigits,
    sendAmount: body.sendAmount,
    currency: body.receiveCurrency ?? undefined,
    routingDecision: decision,
  })

  const chain = [
    decision.selected,
    ...decision.fallbacks.map((f) => ({
      providerId: f.providerId,
      providerPlanId: f.providerPlanId,
      providerCode: undefined as string | undefined,
      providerName: undefined as string | undefined,
      price: f.price,
      currency: f.currency,
    })),
  ].filter(Boolean) as Array<{
    providerId: string
    providerPlanId: string
    providerCode?: string
    providerName?: string
    price?: number
    currency?: string
  }>

  const attemptsLog: Array<{ providerId: string; providerPlanId: string; ok: boolean; error?: string }> = []

  for (const hop of chain) {
    const prov = await dbGetProvider(hop.providerId)
    if (!prov) {
      attemptsLog.push({ providerId: hop.providerId, providerPlanId: hop.providerPlanId, ok: false, error: 'PROVIDER_NOT_FOUND' })
      continue
    }

    const adapterKey = String(prov.adapter_key || '').toLowerCase()
    const exec = await executeMappedRecharge({
      adapterKey,
      providerPlanId: hop.providerPlanId,
      phoneDigits,
      externalId: distributorRef,
      sendAmount: body.sendAmount,
    })

    attemptsLog.push({
      providerId: hop.providerId,
      providerPlanId: hop.providerPlanId,
      ok: exec.ok,
      error: exec.error,
    })

    await dbUpdateRechargeAttempt(attempt.id, { attempts: attemptsLog })

    if (exec.ok) {
      await dbUpdateRechargeAttempt(attempt.id, {
        status: 'success',
        selected_provider_id: hop.providerId,
        selected_provider_plan_id: hop.providerPlanId,
        provider_adapter: adapterKey,
        provider_ref: exec.providerRef ?? null,
        provider_response: exec.raw ?? null,
        error: null,
      })
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
      }
    }
  }

  await dbUpdateRechargeAttempt(attempt.id, {
    status: 'failed',
    error: 'ALL_PROVIDERS_FAILED',
    attempts: attemptsLog,
  })
  await audit('recharge.failed', attempt.id, { distributorRef, attempts: attemptsLog })

  return {
    ok: false as const,
    status: 502,
    error: 'All providers failed',
    decision,
    attempts: attemptsLog,
    attemptId: attempt.id,
    distributorRef,
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
