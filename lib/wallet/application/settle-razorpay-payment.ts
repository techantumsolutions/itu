/**
 * Application service: Razorpay payment verification + settlement.
 * HTTP adapters must only parse the request and map the result to NextResponse.
 */

import crypto from 'crypto'
import { getOrderDb, updateOrderDb } from '@/lib/topup/orders-db'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { executeCheckout } from '@/lib/topup/checkout-service'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import { attachUserIdToCheckoutRecords } from '@/lib/checkout/attach-checkout-user'
import { redeemPoints } from '@/lib/rewards/reward-service'
import { assertPaymentOrderIsActiveForSession } from '@/lib/payments/active-payment-order'
import { debitWalletForCheckout } from '@/lib/wallet/ledger/debit-for-checkout'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type SettleRazorpayPaymentInput = {
  request: Request
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
  paymentOrderId?: string
  orderId?: string
}

export type SettleRazorpayPaymentResult = {
  body: Record<string, unknown>
  status: number
}

export async function settleRazorpayPayment(
  input: SettleRazorpayPaymentInput,
): Promise<SettleRazorpayPaymentResult> {
  const razorpay_order_id = input.razorpayOrderId
  const razorpay_payment_id = input.razorpayPaymentId
  const razorpay_signature = input.razorpaySignature
  const orderId = input.orderId || ''
  const paymentOrderId = input.paymentOrderId || ''

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return { body: { ok: false, error: 'Missing Razorpay fields' }, status: 400 }
  }

  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) {
    return { body: { ok: false, error: 'Razorpay secret missing' }, status: 500 }
  }

  const sigPayload = `${razorpay_order_id}|${razorpay_payment_id}`
  const expected = crypto.createHmac('sha256', secret).update(sigPayload).digest('hex')

  if (expected !== razorpay_signature) {
    if (paymentOrderId) {
      await supabaseRest(`payment_orders?id=eq.${enc(paymentOrderId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', payment_id: razorpay_payment_id }),
      })
    }
    if (orderId) {
      await updateOrderDb(orderId, {
        status: 'failed',
        razorpay_order_id,
        razorpay_payment_id,
        payment_gateway: 'razorpay',
      })
    }
    return { body: { ok: false, error: 'Invalid signature' }, status: 400 }
  }

  if (paymentOrderId) {
    const requestUserId = await getUserIdFromRequest(input.request)

    const poResBefore = await supabaseRest(
      `payment_orders?id=eq.${enc(paymentOrderId)}&select=id,order_id,status,plan_id,mobile_number,operator_id,country_id,amount,currency,user_id,metadata,checkout_session_id,pending_transaction_id,lcr_attempt_id&limit=1`,
      { cache: 'no-store' },
    )
    const poRowsBefore = poResBefore.ok
      ? ((await poResBefore.json()) as Array<Record<string, unknown>>)
      : []
    const poBefore = poRowsBefore[0]

    if (poBefore && String(poBefore.order_id ?? '') !== razorpay_order_id) {
      return { body: { ok: false, error: 'Payment order mismatch' }, status: 400 }
    }

    if (!poBefore) {
      return { body: { ok: false, error: 'Payment order not found' }, status: 404 }
    }

    const sessionId =
      (typeof poBefore.checkout_session_id === 'string' && poBefore.checkout_session_id) ||
      (typeof poBefore.pending_transaction_id === 'string' && poBefore.pending_transaction_id) ||
      null
    const activeGate = await assertPaymentOrderIsActiveForSession({
      paymentOrderId,
      checkoutSessionId: sessionId,
      status: String(poBefore.status ?? ''),
    })
    if (!activeGate.ok) {
      return {
        body: { ok: false, error: activeGate.error, code: activeGate.code },
        status: 409,
      }
    }

    if (poBefore?.status === 'paid') {
      const metadata = (
        poBefore.metadata && typeof poBefore.metadata === 'object' ? poBefore.metadata : {}
      ) as Record<string, any>
      const checkoutSessionId =
        (typeof poBefore.checkout_session_id === 'string' && poBefore.checkout_session_id) ||
        (typeof poBefore.pending_transaction_id === 'string' && poBefore.pending_transaction_id) ||
        ''

      if (checkoutSessionId) {
        const effectiveUserId = poBefore.user_id
          ? String(poBefore.user_id)
          : requestUserId || undefined
        if (effectiveUserId) {
          await attachUserIdToCheckoutRecords({
            userId: effectiveUserId,
            transactionId: checkoutSessionId,
            paymentOrderId,
          })
        }
        const systemPlanId =
          typeof metadata.system_plan_id === 'string' ? metadata.system_plan_id.trim() : ''
        const result = await executeCheckout({
          paymentOrderId,
          planId: String(poBefore.plan_id ?? ''),
          systemPlanId: systemPlanId || undefined,
          mobileNumber: String(poBefore.mobile_number ?? ''),
          operatorId: String(poBefore.operator_id ?? ''),
          countryId: String(poBefore.country_id ?? ''),
          amount: Number(poBefore.amount ?? 0),
          currency: String(poBefore.currency ?? 'INR'),
          razorpayPaymentId: razorpay_payment_id,
          userId: effectiveUserId,
          checkoutSessionId,
          pendingTransactionId: checkoutSessionId,
        })
        return {
          body: {
            ok: result.ok,
            transactionId: result.transactionId,
            rechargeOrderId: result.rechargeOrderId,
            providerRef: result.providerRef,
            providerName: result.providerName,
            status: result.status,
            error: result.error,
            hints: result.hints,
            rewardPointsEarned: result.rewardPointsEarned ?? 0,
          },
          status: 200,
        }
      }
    }

    const claimRes = await supabaseRest(
      `payment_orders?id=eq.${enc(paymentOrderId)}&status=in.(created,pending_payment)`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'paid', payment_id: razorpay_payment_id }),
      },
    )
    const claimRows = claimRes.ok ? ((await claimRes.json()) as Array<Record<string, unknown>>) : []
    const claimed = claimRows.length > 0

    const poRes = await supabaseRest(
      `payment_orders?id=eq.${enc(paymentOrderId)}&select=id,status,plan_id,mobile_number,operator_id,country_id,amount,currency,user_id,metadata,checkout_session_id,pending_transaction_id&limit=1`,
      { cache: 'no-store' },
    )
    const poRows = poRes.ok ? ((await poRes.json()) as Array<Record<string, unknown>>) : []
    const po = poRows[0]

    if (!po) {
      return { body: { ok: false, error: 'Payment order not found' }, status: 404 }
    }

    const metadata = (po.metadata && typeof po.metadata === 'object' ? po.metadata : {}) as Record<
      string,
      any
    >
    const effectiveUserId = po.user_id ? String(po.user_id) : requestUserId || undefined
    const checkoutSessionId =
      (typeof po.checkout_session_id === 'string' && po.checkout_session_id) ||
      (typeof po.pending_transaction_id === 'string' && po.pending_transaction_id) ||
      ''
    const usedWalletBalance = Number(metadata.used_wallet_balance ?? 0)
    const usedRewardPoints = Number(metadata.used_reward_points ?? 0)
    const razorpayAmount = Number(po.amount ?? 0)
    const fullAmount = razorpayAmount + usedWalletBalance

    const walletCurrency = metadata.wallet_currency
      ? String(metadata.wallet_currency).toUpperCase()
      : String(po.currency ?? 'INR')

    let walletDebitFailed = false
    if (claimed && effectiveUserId && usedWalletBalance > 0) {
      const debit = await debitWalletForCheckout({
        userId: effectiveUserId,
        amountInPayCurrency: usedWalletBalance,
        payCurrency: String(po.currency ?? 'INR'),
        walletCurrency,
        mobileNumber: String(po.mobile_number ?? ''),
        planId: String(po.plan_id ?? ''),
        operatorId: String(po.operator_id ?? ''),
        countryId: String(po.country_id ?? ''),
        paymentOrderId: String(po.id),
        razorpayPaymentId: razorpay_payment_id,
        exchangeOrderLabel: String(po.id),
        hideSameCurrencyDebitFromUser: true,
      })
      if (!debit.ok) walletDebitFailed = true
    }

    if (walletDebitFailed) {
      const failureReason = 'INSUFFICIENT_WALLET_BALANCE'
      console.error('[PAYMENT LOG] wallet debit failed — aborting recharge before provider', {
        paymentOrderId,
        checkoutSessionId,
        failureReason,
      })
      if (checkoutSessionId) {
        await supabaseRest(`transactions?id=eq.${enc(checkoutSessionId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed' }),
        }).catch(() => {})
        await supabaseRest(`recharge_orders?transaction_id=eq.${enc(checkoutSessionId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed', failure_reason: failureReason }),
        }).catch(() => {})
        await supabaseRest(`lcr_v2_recharge_attempts?distributor_ref=eq.${enc(checkoutSessionId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed', error: failureReason }),
        }).catch(() => {})
      }
      return {
        body: {
          ok: false,
          transactionId: checkoutSessionId || undefined,
          status: 'failed',
          error: 'Wallet balance was insufficient to complete this payment. No recharge was made.',
        },
        status: 200,
      }
    }

    const systemPlanId =
      typeof metadata.system_plan_id === 'string' ? metadata.system_plan_id.trim() : ''

    if (effectiveUserId && checkoutSessionId) {
      await attachUserIdToCheckoutRecords({
        userId: effectiveUserId,
        transactionId: checkoutSessionId,
        paymentOrderId,
      })
    }

    console.log('[PAYMENT LOG] payment successful', {
      paymentOrderId,
      checkoutSessionId,
      razorpayPaymentId: razorpay_payment_id,
    })

    const result = await executeCheckout({
      paymentOrderId,
      planId: String(po.plan_id ?? ''),
      systemPlanId: systemPlanId || undefined,
      mobileNumber: String(po.mobile_number ?? ''),
      operatorId: String(po.operator_id ?? ''),
      countryId: String(po.country_id ?? ''),
      amount: fullAmount,
      currency: String(po.currency ?? 'INR'),
      razorpayPaymentId: razorpay_payment_id,
      userId: effectiveUserId,
      usedWalletBalance,
      walletCurrency,
      checkoutSessionId: checkoutSessionId || undefined,
      pendingTransactionId: checkoutSessionId || undefined,
    })

    if (claimed && result.ok && effectiveUserId && usedRewardPoints > 0) {
      const pointsResult = await redeemPoints(
        effectiveUserId,
        result.transactionId || checkoutSessionId || null,
        usedRewardPoints,
        `Redeemed on recharge ${po.mobile_number}`,
      )
      if (!pointsResult) {
        console.error(
          '[REWARDS] Failed to deduct user points after successful Razorpay verification',
        )
      }
    }

    return {
      body: {
        ok: result.ok,
        transactionId: result.transactionId,
        rechargeOrderId: result.rechargeOrderId,
        providerRef: result.providerRef,
        providerName: result.providerName,
        status: result.status,
        error: result.error,
        hints: result.hints,
        rewardPointsEarned: result.rewardPointsEarned ?? 0,
      },
      status: 200,
    }
  }

  if (orderId) {
    const order = await getOrderDb(orderId)
    if (!order) {
      return { body: { ok: false, error: 'Order not found' }, status: 404 }
    }

    await updateOrderDb(orderId, {
      status: 'success',
      razorpay_order_id,
      razorpay_payment_id,
      payment_gateway: 'razorpay',
    })

    return { body: { ok: true }, status: 200 }
  }

  return { body: { ok: false, error: 'Missing orderId or paymentOrderId' }, status: 400 }
}
