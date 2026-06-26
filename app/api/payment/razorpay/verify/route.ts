import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getOrderDb, updateOrderDb } from '@/lib/topup/orders-db'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { executeCheckout } from '@/lib/topup/checkout-service'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import { attachUserIdToCheckoutRecords } from '@/lib/topup/attach-checkout-user'

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

      // Mark payment_orders as paid (idempotent)
      const poResBefore = await supabaseRest(
        `payment_orders?id=eq.${enc(paymentOrderId)}&select=id,status,plan_id,mobile_number,operator_id,country_id,amount,currency,user_id,metadata,checkout_session_id,pending_transaction_id,lcr_attempt_id&limit=1`,
        { cache: 'no-store' },
      )
      const poRowsBefore = poResBefore.ok ? ((await poResBefore.json()) as Array<Record<string, unknown>>) : []
      const poBefore = poRowsBefore[0]

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
            providerRef: result.providerRef,
            providerName: result.providerName,
            status: result.status,
            error: result.error,
            hints: result.hints,
            rewardPointsEarned: result.rewardPointsEarned ?? 0,
          })
        }
      }

      await supabaseRest(`payment_orders?id=eq.${enc(paymentOrderId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'paid', payment_id: razorpay_payment_id }),
      })

      // Load payment order details for checkout execution
      const poRes = await supabaseRest(
        `payment_orders?id=eq.${enc(paymentOrderId)}&select=id,plan_id,mobile_number,operator_id,country_id,amount,currency,user_id,metadata,checkout_session_id,pending_transaction_id&limit=1`,
        { cache: 'no-store' },
      )
      const poRows = poRes.ok ? ((await poRes.json()) as Array<Record<string, unknown>>) : []
      const po = poRows[0]

      if (!po) {
        return NextResponse.json({ ok: false, error: 'Payment order not found' }, { status: 404 })
      }

      const metadata = (po.metadata && typeof po.metadata === 'object' ? po.metadata : {}) as Record<string, any>
      const usedWalletBalance = Number(metadata.used_wallet_balance ?? 0)
      const razorpayAmount = Number(po.amount ?? 0)
      const fullAmount = razorpayAmount + usedWalletBalance

      const walletCurrency = metadata.wallet_currency ? String(metadata.wallet_currency).toUpperCase() : String(po.currency ?? 'INR')

      // If logged in, credit the Razorpay amount to the user's wallet as a topup
      if (effectiveUserId) {
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
            await supabaseRest('transactions', {
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
            }).catch((err) => console.error('Failed to insert exchange debit transaction:', err))

            // Credit to the payment currency wallet
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
          } else {
            // Debit from the walletCurrency wallet immediately for same currency
            await supabaseRest('transactions', {
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
            }).catch((err) => console.error('Failed to insert same-currency wallet deduction:', err))
          }
        }
      }

      // Execute full checkout: transaction → routing → provider → recharge
      const systemPlanId =
        typeof metadata.system_plan_id === 'string' ? metadata.system_plan_id.trim() : ''

      const checkoutSessionId =
        (typeof po.checkout_session_id === 'string' && po.checkout_session_id) ||
        (typeof po.pending_transaction_id === 'string' && po.pending_transaction_id) ||
        ''

      const effectiveUserId = po.user_id ? String(po.user_id) : requestUserId || undefined
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

      return NextResponse.json({
        ok: result.ok,
        transactionId: result.transactionId,
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

