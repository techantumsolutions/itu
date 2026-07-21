/**
 * Gate for paid customer recharge fulfillment (path A).
 * Anonymous / unpaid callers never pass this gate.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { dbFindRechargeByDistributorRef } from '@/lib/lcr-v2/recharge-db'
import { claimCheckoutTransactionOwnership } from '@/lib/checkout/attach-checkout-user'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type PaidRechargeGate =
  | {
      ok: true
      userId: string
      transactionId: string
      paymentOrderId: string
      paymentOrder: Record<string, unknown>
      attemptId: string
    }
  | { ok: false; response: NextResponse }

/**
 * Path A: authenticated user + claimed txn ownership + paid payment_order +
 * prepare-checkout attempt. Provider claim stays inside executeCheckout.
 */
export async function requireVerifiedPaidRecharge(
  request: Request,
  body: Record<string, unknown>,
): Promise<PaidRechargeGate> {
  const user = await getAuthenticatedRequestUser(request)
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const transactionId =
    (typeof body.transactionId === 'string' && body.transactionId.trim()) ||
    (typeof body.checkoutSessionId === 'string' && body.checkoutSessionId.trim()) ||
    (typeof body.pendingTransactionId === 'string' && body.pendingTransactionId.trim()) ||
    ''

  if (!transactionId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'transactionId is required for paid checkout fulfillment. Unpaid provider calls require admin providers.execute.',
          code: 'PAID_CHECKOUT_REQUIRED',
        },
        { status: 400 },
      ),
    }
  }

  const ownership = await claimCheckoutTransactionOwnership({
    userId: user.id,
    transactionId,
  })
  if (!ownership.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: ownership.error, code: 'TRANSACTION_CLAIM_FAILED' },
        { status: ownership.status },
      ),
    }
  }

  const poRes = await supabaseRest(
    `payment_orders?or=(checkout_session_id.eq.${enc(transactionId)},pending_transaction_id.eq.${enc(
      transactionId,
    )})&status=eq.paid&select=id,order_id,status,plan_id,mobile_number,operator_id,country_id,amount,currency,user_id,metadata,payment_id,checkout_session_id,pending_transaction_id&order=created_at.desc&limit=1`,
    { cache: 'no-store' },
  )
  if (!poRes.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unable to verify payment' }, { status: 500 }),
    }
  }
  const poRows = (await poRes.json().catch(() => [])) as Array<Record<string, unknown>>
  const paymentOrder = poRows[0]
  if (!paymentOrder?.id || String(paymentOrder.status) !== 'paid') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Verified paid payment required before recharge',
          code: 'PAYMENT_NOT_PAID',
        },
        { status: 402 },
      ),
    }
  }

  if (paymentOrder.user_id && String(paymentOrder.user_id) !== user.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  const attempt = await dbFindRechargeByDistributorRef(transactionId).catch(() => null)
  if (!attempt?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Recharge attempt not found for transaction (complete prepare-checkout first)',
          code: 'ATTEMPT_MISSING',
        },
        { status: 404 },
      ),
    }
  }

  return {
    ok: true,
    userId: user.id,
    transactionId,
    paymentOrderId: String(paymentOrder.id),
    paymentOrder,
    attemptId: attempt.id,
  }
}

export function extractCheckoutTransactionId(body: Record<string, unknown>): string {
  return (
    (typeof body.transactionId === 'string' && body.transactionId.trim()) ||
    (typeof body.checkoutSessionId === 'string' && body.checkoutSessionId.trim()) ||
    (typeof body.pendingTransactionId === 'string' && body.pendingTransactionId.trim()) ||
    ''
  )
}
