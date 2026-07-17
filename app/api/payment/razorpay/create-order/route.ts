import { NextResponse } from 'next/server'
import { linkPaymentOrderToCheckoutSession } from '@/lib/topup/prepare-checkout-service'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { runtimeEnv } from '@/lib/env/runtime'
import { toRazorpayMinorUnits, validateRazorpayPaymentAmount } from '@/lib/payments/razorpay-amount'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import { attachUserIdToCheckoutRecords } from '@/lib/topup/attach-checkout-user'
import { resolveCheckoutPriceAuthority } from '@/lib/payments/checkout-price-authority'

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
    const usedRewardPoints = typeof body.usedRewardPoints === 'number' ? body.usedRewardPoints : 0
    const checkoutPricing =
      body.checkoutPricing && typeof body.checkoutPricing === 'object'
        ? (body.checkoutPricing as Record<string, unknown>)
        : undefined

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

    const userId = await getUserIdFromRequest(request)

    // C2 + C4 (preliminary validation): the pending transaction is the source of
    // truth. Recompute the charge and validate wallet / reward credits with
    // server-side data only. Client `amount`, `usedWalletBalance`,
    // `usedRewardPoints`, and any client fxRate are advisory only. The authoritative
    // wallet/reward debit still happens at verify (see H2/H3).
    const authority = await resolveCheckoutPriceAuthority({
      userId,
      checkoutSessionId,
      payCurrency: currency,
      requestedWalletAmount: usedWalletBalance,
      walletCurrency,
      requestedRewardPoints: usedRewardPoints,
    })
    if (!authority.validationResult.ok) {
      const v = authority.validationResult
      return NextResponse.json({ error: v.error, code: v.code }, { status: v.status })
    }

    // Server-authoritative charge (client under/over-charge is ignored).
    const serverCharge = authority.razorpayCharge
    const serverWalletCredit = authority.walletCredit
    const serverRewardPoints = authority.rewardPoints
    const serverWalletCurrency = authority.walletCurrency

    const amountCheck = validateRazorpayPaymentAmount(serverCharge, currency)
    if (!amountCheck.ok) {
      return NextResponse.json({ error: amountCheck.error, code: 'RAZORPAY_MIN_AMOUNT' }, { status: 400 })
    }

    const orderPayload = {
      amount: amountCheck.minorUnits,
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

    // Insert into payment_orders table (server-validated amount + wallet/reward).
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
          amount: serverCharge,
          currency,
          status: 'created',
          user_id: userId || null,
          metadata: {
            razorpay_amount: razorpayOrder.amount,
            used_wallet_balance: serverWalletCredit,
            wallet_currency: serverWalletCurrency,
            system_plan_id: systemPlanId || null,
            used_reward_points: serverRewardPoints,
          },
        },
      ]),
    })
    const dbRows = dbRes.ok ? ((await dbRes.json()) as Array<{ id: string }>) : []
    const paymentOrderId = dbRows[0]?.id ?? ''

    if (paymentOrderId && checkoutSessionId) {
      if (userId) {
        await attachUserIdToCheckoutRecords({
          userId,
          transactionId: checkoutSessionId,
          paymentOrderId,
        })
      }

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
        totalPayable: serverCharge,
        paymentCurrency: currency,
        checkoutPricing: checkoutPricing
          ? {
              platformFee:
                typeof checkoutPricing.platformFee === 'number' ? checkoutPricing.platformFee : undefined,
              paymentGatewayFee:
                typeof checkoutPricing.paymentGatewayFee === 'number'
                  ? checkoutPricing.paymentGatewayFee
                  : undefined,
              tax: typeof checkoutPricing.tax === 'number' ? checkoutPricing.tax : undefined,
              planPrice: typeof checkoutPricing.planPrice === 'number' ? checkoutPricing.planPrice : undefined,
              planPriceCurrency:
                typeof checkoutPricing.planPriceCurrency === 'string'
                  ? checkoutPricing.planPriceCurrency
                  : undefined,
              totalInRechargeCurrency:
                typeof checkoutPricing.totalInRechargeCurrency === 'number'
                  ? checkoutPricing.totalInRechargeCurrency
                  : undefined,
              fxRate: typeof checkoutPricing.fxRate === 'number' ? checkoutPricing.fxRate : null,
              fxFromCurrency:
                typeof checkoutPricing.fxFromCurrency === 'string'
                  ? checkoutPricing.fxFromCurrency
                  : undefined,
              fxToCurrency:
                typeof checkoutPricing.fxToCurrency === 'string' ? checkoutPricing.fxToCurrency : undefined,
            }
          : undefined,
      })
    }

    console.log('[PAYMENT LOG] payment initiated', {
      paymentOrderId,
      checkoutSessionId,
      amount: serverCharge,
      currency,
    })

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
