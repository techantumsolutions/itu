import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getOrderDb, updateOrderDb } from '@/lib/topup/orders-db'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { executeCheckout } from '@/lib/topup/checkout-service'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import { attachUserIdToCheckoutRecords } from '@/lib/topup/attach-checkout-user'
import { redeemPoints } from '@/lib/rewards/reward-service'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const razorpay_order_id = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id.trim() : ''
    const razorpay_payment_id = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id.trim() : ''
    const razorpay_signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature.trim() : ''

    // Support both old flow (orderId-based) and new flow (paymentOrderId-based)
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    const paymentOrderId = typeof body.paymentOrderId === 'string' ? body.paymentOrderId.trim() : ''

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ ok: false, error: 'Missing Razorpay fields' }, { status: 400 })
    }

    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) return NextResponse.json({ ok: false, error: 'Razorpay secret missing' }, { status: 500 })

    // Validate the Razorpay signature: HMAC_SHA256(order_id|payment_id, key_secret)
    const sigPayload = `${razorpay_order_id}|${razorpay_payment_id}`
    const expected = crypto.createHmac('sha256', secret).update(sigPayload).digest('hex')

    if (expected !== razorpay_signature) {
      // Mark payment_orders as failed if new flow
      if (paymentOrderId) {
        await supabaseRest(`payment_orders?id=eq.${enc(paymentOrderId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed', payment_id: razorpay_payment_id }),
        })
      }
      // Legacy flow: update old order
      if (orderId) {
        await updateOrderDb(orderId, { status: 'failed', razorpay_order_id, razorpay_payment_id, payment_gateway: 'razorpay' })
      }
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
    }

    // --- New checkout flow (paymentOrderId present) ---
    if (paymentOrderId) {
      const requestUserId = await getUserIdFromRequest(request)

      // Load the pending payment order before any state change (also used for C3).
      const poResBefore = await supabaseRest(
        `payment_orders?id=eq.${enc(paymentOrderId)}&select=id,order_id,status,plan_id,mobile_number,operator_id,country_id,amount,currency,user_id,metadata,checkout_session_id,pending_transaction_id,lcr_attempt_id&limit=1`,
        { cache: 'no-store' },
      )
      const poRowsBefore = poResBefore.ok ? ((await poResBefore.json()) as Array<Record<string, unknown>>) : []
      const poBefore = poRowsBefore[0]

      // C3: the Razorpay signature only proves ownership of `razorpay_order_id`.
      // Ensure the client-supplied paymentOrderId actually belongs to that
      // Razorpay order before marking paid / fulfilling.
      if (poBefore && String(poBefore.order_id ?? '') !== razorpay_order_id) {
        return NextResponse.json({ ok: false, error: 'Payment order mismatch' }, { status: 400 })
      }

      if (poBefore?.status === 'paid') {
        const metadata = (poBefore.metadata && typeof poBefore.metadata === 'object' ? poBefore.metadata : {}) as Record<string, any>
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
          return NextResponse.json({
            ok: result.ok,
            transactionId: result.transactionId,
            rechargeOrderId: result.rechargeOrderId,
            providerRef: result.providerRef,
            providerName: result.providerName,
            status: result.status,
            error: result.error,
            hints: result.hints,
            rewardPointsEarned: result.rewardPointsEarned ?? 0,
          })
        }
      }

      // H1 (payment claim): atomically transition the pending order created/failed
      // -> paid. PostgreSQL guarantees a single winner for this conditional UPDATE;
      // only the winner performs the one-time wallet debit / reward redemption
      // below. Provider fulfillment is separately guarded by the recharge attempt
      // claim inside executeCheckout, so exactly-once holds without Redis.
      const claimRes = await supabaseRest(
        `payment_orders?id=eq.${enc(paymentOrderId)}&status=in.(created,failed)`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'paid', payment_id: razorpay_payment_id }),
        },
      )
      const claimRows = claimRes.ok ? ((await claimRes.json()) as Array<Record<string, unknown>>) : []
      const claimed = claimRows.length > 0

      // Load payment order details for checkout execution
      const poRes = await supabaseRest(
        `payment_orders?id=eq.${enc(paymentOrderId)}&select=id,status,plan_id,mobile_number,operator_id,country_id,amount,currency,user_id,metadata,checkout_session_id,pending_transaction_id&limit=1`,
        { cache: 'no-store' },
      )
      const poRows = poRes.ok ? ((await poRes.json()) as Array<Record<string, unknown>>) : []
      const po = poRows[0]

      if (!po) {
        return NextResponse.json({ ok: false, error: 'Payment order not found' }, { status: 404 })
      }

      // H1: `claimed` is true only for the request that won the payment claim.
      // One-time money movement (wallet debit + reward redemption) is gated on it.
      // Losers still proceed to executeCheckout, where the recharge attempt claim
      // makes them wait for and return the winner's actual terminal result.
      const metadata = (po.metadata && typeof po.metadata === 'object' ? po.metadata : {}) as Record<string, any>
      const effectiveUserId = po.user_id ? String(po.user_id) : requestUserId || undefined
      const checkoutSessionId =
        (typeof po.checkout_session_id === 'string' && po.checkout_session_id) ||
        (typeof po.pending_transaction_id === 'string' && po.pending_transaction_id) ||
        ''
      const usedWalletBalance = Number(metadata.used_wallet_balance ?? 0)
      const usedRewardPoints = Number(metadata.used_reward_points ?? 0)
      const razorpayAmount = Number(po.amount ?? 0)
      const fullAmount = razorpayAmount + usedWalletBalance

      const walletCurrency = metadata.wallet_currency ? String(metadata.wallet_currency).toUpperCase() : String(po.currency ?? 'INR')

      // Only the payment-claim winner performs the one-time wallet debit.
      // H2/H3: the debit is authoritative. The DB trigger now rejects any debit
      // that would overdraw the wallet (insufficient balance / lost concurrent
      // race), so we must detect a failed debit and refuse to call the provider.
      let walletDebitFailed = false
      if (claimed && effectiveUserId) {
        if (usedWalletBalance > 0) {
          if (walletCurrency !== String(po.currency ?? 'INR')) {
            let walletDeductionAmt = usedWalletBalance
            const rateRes = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' }).catch(() => null)
            if (rateRes?.ok) {
              const data = await rateRes.json()
              const rates = data?.rates
              const payCurrency = String(po.currency ?? 'INR')
              if (rates && rates[payCurrency] && rates[walletCurrency]) {
                const rateToEUR = 1 / rates[payCurrency]
                const rateFromEUR = rates[walletCurrency]
                walletDeductionAmt = usedWalletBalance * rateToEUR * rateFromEUR
              }
            }

            // Debit from the walletCurrency wallet
            const debitRes = await supabaseRest('transactions', {
              method: 'POST',
              body: JSON.stringify([{
                user_id: effectiveUserId,
                type: 'payment',
                amount: walletDeductionAmt,
                currency: walletCurrency,
                status: 'completed',
                description: `Recharge ${po.mobile_number}`,
                metadata: {
                  plan_id: po.plan_id,
                  mobile_number: po.mobile_number,
                  operator_id: po.operator_id,
                  country_id: po.country_id,
                  payment_order_id: po.id,
                  razorpay_payment_id: razorpay_payment_id,
                }
              }])
            }).catch(() => null)

            if (!debitRes || !debitRes.ok) {
              walletDebitFailed = true
            } else {
              // Credit to the payment currency wallet (only after a successful debit)
              await supabaseRest('transactions', {
                method: 'POST',
                body: JSON.stringify([{
                  user_id: effectiveUserId,
                  type: 'topup',
                  amount: usedWalletBalance,
                  currency: String(po.currency ?? 'INR'),
                  status: 'completed',
                  description: `Exchange credit from ${walletCurrency} wallet for order ${po.id}`,
                  metadata: {
                    hide_from_user: true,
                  }
                }])
              }).catch((err) => console.error('Failed to insert exchange credit transaction:', err))
            }
          } else {
            // Debit from the walletCurrency wallet immediately for same currency
            const debitRes = await supabaseRest('transactions', {
              method: 'POST',
              body: JSON.stringify([{
                user_id: effectiveUserId,
                type: 'payment',
                amount: usedWalletBalance,
                currency: walletCurrency,
                status: 'completed',
                description: `Recharge ${po.mobile_number}`,
                metadata: {
                  plan_id: po.plan_id,
                  mobile_number: po.mobile_number,
                  operator_id: po.operator_id,
                  country_id: po.country_id,
                  payment_order_id: po.id,
                  razorpay_payment_id: razorpay_payment_id,
                  hide_from_user: true,
                }
              }])
            }).catch(() => null)

            if (!debitRes || !debitRes.ok) {
              walletDebitFailed = true
            }
          }
        }
      }

      // H2/H3: if the authoritative wallet debit failed, fail safely — do NOT call
      // the provider. The card portion (if any) was already captured, so we leave
      // payment_orders as 'paid' and mark the recharge terminal-failed. This makes
      // the case recoverable by the existing admin refund / reconciliation path.
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
        return NextResponse.json({
          ok: false,
          transactionId: checkoutSessionId || undefined,
          status: 'failed',
          error: 'Wallet balance was insufficient to complete this payment. No recharge was made.',
        })
      }

      // Execute full checkout: transaction → routing → provider → recharge
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
          `Redeemed on recharge ${po.mobile_number}`
        )
        if (!pointsResult) {
          console.error('[REWARDS] Failed to deduct user points after successful Razorpay verification')
        }
      }

      return NextResponse.json({
        ok: result.ok,
        transactionId: result.transactionId,
        rechargeOrderId: result.rechargeOrderId,
        providerRef: result.providerRef,
        providerName: result.providerName,
        status: result.status,
        error: result.error,
        hints: result.hints,
        rewardPointsEarned: result.rewardPointsEarned ?? 0,
      })
    }

    // --- Legacy flow (orderId present) ---
    if (orderId) {
      const order = await getOrderDb(orderId)
      if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })

      await updateOrderDb(orderId, {
        status: 'success',
        razorpay_order_id,
        razorpay_payment_id,
        payment_gateway: 'razorpay',
      })

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'Missing orderId or paymentOrderId' }, { status: 400 })
  } catch (error) {
    console.error('razorpay/verify:', error)
    return NextResponse.json({ ok: false, error: 'Verification failed' }, { status: 500 })
  }
}

