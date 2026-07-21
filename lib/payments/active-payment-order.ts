/**
 * Enforce one active (unpaid) payment_order per checkout session.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type ActivePaymentOrderRow = {
  id: string
  order_id: string
  status: string
  amount: number
  currency: string
  plan_id?: string
  mobile_number?: string
  operator_id?: string | null
  country_id?: string | null
  user_id?: string | null
  metadata?: Record<string, unknown> | null
  checkout_session_id?: string | null
  pending_transaction_id?: string | null
}

/** Load the single active unpaid payment_order for a checkout session (if any). */
export async function loadActivePaymentOrder(
  checkoutSessionId: string,
): Promise<ActivePaymentOrderRow | null> {
  const res = await supabaseRest(
    `payment_orders?checkout_session_id=eq.${enc(
      checkoutSessionId,
    )}&status=in.(created,pending_payment)&select=id,order_id,status,amount,currency,plan_id,mobile_number,operator_id,country_id,user_id,metadata,checkout_session_id,pending_transaction_id&order=created_at.desc&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json().catch(() => [])) as ActivePaymentOrderRow[]
  return rows[0] ?? null
}

export function paymentOrderMatchesAuthority(
  po: ActivePaymentOrderRow,
  authority: {
    razorpayCharge: number
    payableAmount: number
    walletCredit: number
    rewardPoints: number
    walletCurrency: string
  },
  currency: string,
): boolean {
  const meta = (po.metadata && typeof po.metadata === 'object' ? po.metadata : {}) as Record<
    string,
    unknown
  >
  const sameAmount = Math.abs(Number(po.amount) - authority.razorpayCharge) < 0.0001
  const sameCurrency = String(po.currency).toUpperCase() === currency.toUpperCase()
  const sameWallet = Math.abs(Number(meta.used_wallet_balance ?? 0) - authority.walletCredit) < 0.0001
  const sameRewards = Number(meta.used_reward_points ?? 0) === authority.rewardPoints
  const poWalletCur = String(meta.wallet_currency ?? '').toUpperCase()
  const authWalletCur = String(authority.walletCurrency ?? '').toUpperCase()
  const sameWalletCur = poWalletCur === authWalletCur || (!poWalletCur && !authWalletCur)
  const samePayable =
    meta.payable_amount == null ||
    Math.abs(Number(meta.payable_amount) - authority.payableAmount) < 0.0001
  return sameAmount && sameCurrency && sameWallet && sameRewards && sameWalletCur && samePayable
}

/**
 * Mark all active unpaid orders for the session as failed (superseded).
 * Merges supersede metadata into each row via a second read is hard in PostgREST bulk patch;
 * status=failed is enough for verify rejection.
 */
export async function expireActivePaymentOrdersForSession(
  checkoutSessionId: string,
): Promise<number> {
  const res = await supabaseRest(
    `payment_orders?checkout_session_id=eq.${enc(
      checkoutSessionId,
    )}&status=in.(created,pending_payment)`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'failed',
        updated_at: new Date().toISOString(),
      }),
    },
  )
  if (!res.ok) {
    console.error('[payment] expireActivePaymentOrders failed', await res.text().catch(() => ''))
    return 0
  }
  const rows = (await res.json().catch(() => [])) as unknown[]
  return Array.isArray(rows) ? rows.length : 0
}

/**
 * Verify-time gate: payment_order must be the active unpaid order for its session
 * (or already paid for idempotent replay). Superseded/failed orders are rejected.
 */
export async function assertPaymentOrderIsActiveForSession(input: {
  paymentOrderId: string
  checkoutSessionId: string | null | undefined
  status: string
}): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const status = String(input.status ?? '').toLowerCase()
  if (status === 'paid') {
    return { ok: true }
  }

  if (status === 'failed' || status === 'refunded') {
    return {
      ok: false,
      error: 'Payment order is no longer active. Create a new order for this checkout session.',
      code: 'PAYMENT_ORDER_SUPERSEDED',
    }
  }

  if (!input.checkoutSessionId) {
    if (status === 'created' || status === 'pending_payment') return { ok: true }
    return { ok: false, error: 'Invalid payment order status', code: 'PAYMENT_ORDER_INVALID' }
  }

  const active = await loadActivePaymentOrder(input.checkoutSessionId)
  if (!active || String(active.id) !== String(input.paymentOrderId)) {
    return {
      ok: false,
      error: 'Payment order is not the active order for this checkout session',
      code: 'PAYMENT_ORDER_NOT_ACTIVE',
    }
  }

  return { ok: true }
}

export type InsertPaymentOrderInput = {
  order_id: string
  plan_id: string
  mobile_number: string
  operator_id?: string | null
  country_id?: string | null
  amount: number
  currency: string
  status: 'created' | 'pending_payment' | 'paid'
  user_id?: string | null
  checkout_session_id: string
  pending_transaction_id?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Sole production INSERT path for payment_orders (Razorpay create + wallet checkout).
 */
export async function insertPaymentOrder(
  input: InsertPaymentOrderInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string; uniqueViolation?: boolean }> {
  const res = await supabaseRest('payment_orders?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        order_id: input.order_id,
        plan_id: input.plan_id,
        mobile_number: input.mobile_number,
        operator_id: input.operator_id ?? null,
        country_id: input.country_id ?? null,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        user_id: input.user_id ?? null,
        checkout_session_id: input.checkout_session_id,
        pending_transaction_id: input.pending_transaction_id ?? input.checkout_session_id,
        metadata: input.metadata ?? {},
      },
    ]),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    const uniqueViolation = /duplicate|unique/i.test(errText)
    console.error('[payment] insertPaymentOrder failed', errText)
    return { ok: false, error: errText || 'insert failed', uniqueViolation }
  }

  const rows = (await res.json().catch(() => [])) as Array<{ id?: string }>
  const id = rows[0]?.id
  if (!id) return { ok: false, error: 'No payment_order id returned' }
  return { ok: true, id }
}
