import { NextResponse } from 'next/server'
import { linkPaymentOrderToCheckoutSession } from '@/lib/topup/prepare-checkout-service'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { runtimeEnv } from '@/lib/env/runtime'
import { toRazorpayMinorUnits } from '@/lib/payments/razorpay-amount'

async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? ''

  // 1. Try GoTrue token
  const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
  const token = m?.[1] ? decodeURIComponent(m[1]) : ''
  if (token) {
    try {
      const user = await supabaseGetUser(token)
      if (user?.id) return user.id
    } catch {
      // ignore
    }
  }

  // 2. Try OTP/guest login user ID
  const om = cookie.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
  const otpUserId = om?.[1] ? decodeURIComponent(om[1]) : ''
  return otpUserId || null
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
    const systemPlanId = typeof body.systemPlanId === 'string' ? body.systemPlanId.trim() : ''
    const amount = typeof body.amount === 'number' ? body.amount : 0
    const currency = typeof body.currency === 'string' ? body.currency.trim() : 'INR'
    const mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.trim() : ''
    const operatorId = typeof body.operatorId === 'string' ? body.operatorId.trim() : ''
    const countryId = typeof body.countryId === 'string' ? body.countryId.trim() : ''
    const usedWalletBalance = typeof body.usedWalletBalance === 'number' ? body.usedWalletBalance : 0
    const walletCurrency = typeof body.walletCurrency === 'string' ? body.walletCurrency.trim().toUpperCase() : ''
    const checkoutSessionId = typeof body.checkoutSessionId === 'string' ? body.checkoutSessionId.trim() : ''

    if (!planId || !amount || !mobileNumber) {
      return NextResponse.json({ error: 'Missing required fields: planId, amount, mobileNumber' }, { status: 400 })
    }
    if (!checkoutSessionId) {
      return NextResponse.json({ error: 'Missing checkoutSessionId — provider must be selected before payment' }, { status: 400 })
    }

    const keyId = runtimeEnv('RAZORPAY_KEY_ID')
    const keySecret = runtimeEnv('RAZORPAY_KEY_SECRET')
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay keys not configured' }, { status: 500 })
    }

    const orderPayload = {
      amount: toRazorpayMinorUnits(amount, currency),
      currency,
      notes: {
        plan_id: planId,
        system_plan_id: systemPlanId || undefined,
        mobile_number: mobileNumber,
        operator_id: operatorId,
        country_id: countryId,
      },
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    const rpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    })
    const rpBody = (await rpRes.json().catch(() => null)) as
      | { id?: string; amount?: number; error?: { description?: string } }
      | null
    if (!rpRes.ok || !rpBody?.id) {
      const detail = rpBody?.error?.description || `Razorpay HTTP ${rpRes.status}`
      return NextResponse.json({ error: detail }, { status: 502 })
    }
    const razorpayOrder = { id: rpBody.id, amount: rpBody.amount ?? orderPayload.amount }

    const userId = await getUserIdFromRequest(request)

    // Insert into payment_orders table
    const dbRes = await supabaseRest('payment_orders?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          order_id: razorpayOrder.id,
          plan_id: planId,
          mobile_number: mobileNumber,
          operator_id: operatorId,
          country_id: countryId,
          amount,
          currency,
          status: 'created',
          user_id: userId || null,
          metadata: {
            razorpay_amount: razorpayOrder.amount,
            used_wallet_balance: usedWalletBalance,
            wallet_currency: walletCurrency,
            system_plan_id: systemPlanId || null,
          },
        },
      ]),
    })
    const dbRows = dbRes.ok ? ((await dbRes.json()) as Array<{ id: string }>) : []
    const paymentOrderId = dbRows[0]?.id ?? ''

    if (paymentOrderId && checkoutSessionId) {
      const txnRes = await supabaseRest(
        `transactions?id=eq.${encodeURIComponent(checkoutSessionId)}&select=metadata&limit=1`,
        { cache: 'no-store' },
      )
      const txnRows = txnRes.ok ? ((await txnRes.json()) as Array<{ metadata?: Record<string, unknown> }>) : []
      const txnMeta = txnRows[0]?.metadata ?? {}

      await linkPaymentOrderToCheckoutSession({
        paymentOrderId,
        checkoutSessionId,
        transactionId: checkoutSessionId,
        rechargeAttemptId:
          typeof txnMeta.recharge_attempt_id === 'string' ? txnMeta.recharge_attempt_id : undefined,
        selectedProviderId:
          typeof txnMeta.selected_provider_id === 'string' ? txnMeta.selected_provider_id : undefined,
        selectedProviderName:
          typeof txnMeta.selected_provider_name === 'string' ? txnMeta.selected_provider_name : undefined,
        selectedProviderPlanId:
          typeof txnMeta.selected_provider_plan_id === 'string' ? txnMeta.selected_provider_plan_id : undefined,
        selectedProviderCost:
          typeof txnMeta.selected_provider_cost === 'number' ? txnMeta.selected_provider_cost : null,
        selectedProviderCurrency:
          typeof txnMeta.selected_provider_currency === 'string' ? txnMeta.selected_provider_currency : null,
        routingResult: txnMeta.routing_result,
        lcrResult: txnMeta.lcr_result,
        providerSelectionTimestamp:
          typeof txnMeta.provider_selection_timestamp === 'string'
            ? txnMeta.provider_selection_timestamp
            : undefined,
      })
    }

    console.log('[PAYMENT LOG] payment initiated', { paymentOrderId, checkoutSessionId, amount, currency })

    return NextResponse.json({
      paymentOrderId,
      razorpay_key_id: keyId,
      razorpay_order_id: razorpayOrder.id,
      razorpay_amount: razorpayOrder.amount,
      currency,
    })
  } catch (error) {
    console.error('payment/razorpay/create-order:', error)
    return NextResponse.json({ error: 'Failed to create Razorpay order' }, { status: 500 })
  }
}
