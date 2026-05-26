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
import { resolveProvider } from '@/lib/routing/routing-engine-service'
import { executeMappedRecharge } from '@/lib/lcr-v2/execute-provider'
import { dbGetProvider } from '@/lib/lcr-v2/recharge-db'

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
}

/** Insert a transaction row (status: pending). */
async function createTransaction(input: CheckoutInput): Promise<string | null> {
  const res = await supabaseRest('transactions?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
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
async function createRechargeOrder(input: CheckoutInput & { transactionId: string }): Promise<string | null> {
  const res = await supabaseRest('recharge_orders?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        transaction_id: input.transactionId,
        phone_number: input.mobileNumber,
        operator_code: input.operatorId,
        operator_name: input.operatorId,
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
  // 1. Create PENDING transaction
  const transactionId = await createTransaction(input)
  if (!transactionId) {
    return { ok: false, status: 'failed', error: 'Failed to create transaction record' }
  }

  // 2. Link transaction to payment
  await createTransactionPayment({
    transactionId,
    paymentOrderId: input.paymentOrderId,
    gateway: 'razorpay',
    gatewayRef: input.razorpayPaymentId,
    amount: input.amount,
  })

  // 3. Create recharge order (PENDING)
  const rechargeOrderId = await createRechargeOrder({ ...input, transactionId })

  // 4. Execute routing engine (does NOT modify it — just calls resolveProvider)
  let routingResult
  try {
    routingResult = await resolveProvider({
      countryId: input.countryId,
      operatorId: input.operatorId,
      productId: input.planId,
      transactionId,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Routing engine error'
    await updateTransactionStatus(transactionId, 'failed', { error: errMsg })
    if (rechargeOrderId) {
      await updateRechargeOrder(rechargeOrderId, { status: 'failed', failure_reason: errMsg })
    }
    return { ok: false, transactionId, rechargeOrderId: rechargeOrderId ?? undefined, status: 'failed', error: errMsg }
  }

  if (!routingResult.selected) {
    const errMsg = 'No active provider available for this transaction'
    await updateTransactionStatus(transactionId, 'failed', { error: errMsg, routing: routingResult })
    if (rechargeOrderId) {
      await updateRechargeOrder(rechargeOrderId, { status: 'failed', failure_reason: errMsg })
    }
    return { ok: false, transactionId, rechargeOrderId: rechargeOrderId ?? undefined, status: 'failed', error: errMsg }
  }

  const selected = routingResult.selected
  const fallbacks = routingResult.fallbacks ?? []
  const chain = [selected, ...fallbacks]

  // 5. Try providers in routing order (primary + fallbacks)
  for (const candidate of chain) {
    const provider = await dbGetProvider(candidate.providerId)
    if (!provider) continue

    const adapterKey = String(provider.adapter_key || '').toLowerCase()
    const phoneDigits = input.mobileNumber.replace(/\D/g, '')
    const externalId = `TXN-${transactionId.slice(0, 8).toUpperCase()}-${Date.now()}`

    const exec = await executeMappedRecharge({
      adapterKey,
      providerPlanId: candidate.providerPlanId,
      phoneDigits,
      externalId,
      sendAmount: input.amount,
    })

    if (exec.ok) {
      // 6. SUCCESS — Update all records
      const providerName = candidate.providerName ?? candidate.providerCode ?? adapterKey
      const providerRef = exec.providerRef ?? externalId

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
      }
    }
  }

  // 7. All providers failed
  const errMsg = 'All providers failed to process the recharge'
  await updateTransactionStatus(transactionId, 'failed', { error: errMsg, routing: routingResult })
  if (rechargeOrderId) {
    await updateRechargeOrder(rechargeOrderId, { status: 'failed', failure_reason: errMsg })
  }

  return { ok: false, transactionId, rechargeOrderId: rechargeOrderId ?? undefined, status: 'failed', error: errMsg }
}
