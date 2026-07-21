import { NextResponse } from 'next/server'
import { linkPaymentOrderToCheckoutSession } from '@/lib/checkout/link-payment-order'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { runtimeEnv } from '@/lib/env/runtime'
import { validateRazorpayPaymentAmount } from '@/lib/payments/razorpay-amount'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import { attachUserIdToCheckoutRecords } from '@/lib/checkout/attach-checkout-user'
import { resolveCheckoutPriceAuthority } from '@/lib/payments/checkout-price-authority'
import {
  expireActivePaymentOrdersForSession,
  insertPaymentOrder,
  loadActivePaymentOrder,
  paymentOrderMatchesAuthority,
} from '@/lib/payments/active-payment-order'

function checkoutPricingFromTxnMeta(meta: Record<string, unknown>) {
  return {
    platformFee: typeof meta.platform_fee === 'number' ? meta.platform_fee : undefined,
    paymentGatewayFee:
      typeof meta.payment_gateway_fee === 'number' ? meta.payment_gateway_fee : undefined,
    tax: typeof meta.tax === 'number' ? meta.tax : undefined,
    planPrice: typeof meta.plan_price === 'number' ? meta.plan_price : undefined,
    planPriceCurrency:
      typeof meta.plan_price_currency === 'string'
        ? meta.plan_price_currency
        : typeof meta.recharge_currency === 'string'
          ? meta.recharge_currency
          : undefined,
    totalInRechargeCurrency:
      typeof meta.total_payable === 'number' ? meta.total_payable : undefined,
    fxRate: typeof meta.fx_rate === 'number' ? meta.fx_rate : null,
    fxFromCurrency:
      typeof meta.fx_from_currency === 'string' ? meta.fx_from_currency : undefined,
    fxToCurrency: typeof meta.fx_to_currency === 'string' ? meta.fx_to_currency : undefined,
  }
}

/**
 * Sole Razorpay order-creation implementation.
 * Charge amount always comes from resolveCheckoutPriceAuthority (pending txn).
 * At most one active unpaid payment_order per checkoutSessionId (reuse or expire+create).
 */
export async function createRazorpayOrderFromCheckoutSession(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}))
    const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
    const systemPlanId = typeof body.systemPlanId === 'string' ? body.systemPlanId.trim() : ''
    const currency = typeof body.currency === 'string' ? body.currency.trim() : 'INR'
    const mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.trim() : ''
    const operatorId = typeof body.operatorId === 'string' ? body.operatorId.trim() : ''
    const countryId = typeof body.countryId === 'string' ? body.countryId.trim() : ''
    const usedWalletBalance = typeof body.usedWalletBalance === 'number' ? body.usedWalletBalance : 0
    const walletCurrency =
      typeof body.walletCurrency === 'string' ? body.walletCurrency.trim().toUpperCase() : ''
    const checkoutSessionId =
      (typeof body.checkoutSessionId === 'string' && body.checkoutSessionId.trim()) ||
      (typeof body.transactionId === 'string' && body.transactionId.trim()) ||
      ''
    const usedRewardPoints = typeof body.usedRewardPoints === 'number' ? body.usedRewardPoints : 0

    if (!planId || !mobileNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: planId, mobileNumber' },
        { status: 400 },
      )
    }

    if (!checkoutSessionId) {
      return NextResponse.json(
        {
          error:
            'Missing checkoutSessionId — complete prepare-checkout first. Legacy amount-based order creation is disabled.',
          code: 'CHECKOUT_SESSION_REQUIRED',
        },
        { status: 400 },
      )
    }

    const keyId = runtimeEnv('RAZORPAY_KEY_ID')
    const keySecret = runtimeEnv('RAZORPAY_KEY_SECRET')
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay keys not configured' }, { status: 500 })
    }

    const userId = await getUserIdFromRequest(request)

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

    const serverCharge = authority.razorpayCharge
    const serverWalletCredit = authority.walletCredit
    const serverRewardPoints = authority.rewardPoints
    const serverWalletCurrency = authority.walletCurrency

    const amountCheck = validateRazorpayPaymentAmount(serverCharge, currency)
    if (!amountCheck.ok) {
      return NextResponse.json(
        { error: amountCheck.error, code: 'RAZORPAY_MIN_AMOUNT' },
        { status: 400 },
      )
    }

    // Reuse existing active unpaid order when authority matches (no second Razorpay order).
    const existing = await loadActivePaymentOrder(checkoutSessionId)
    if (
      existing &&
      paymentOrderMatchesAuthority(
        existing,
        {
          razorpayCharge: serverCharge,
          payableAmount: authority.payableAmount,
          walletCredit: serverWalletCredit,
          rewardPoints: serverRewardPoints,
          walletCurrency: serverWalletCurrency,
        },
        currency,
      )
    ) {
      console.log('[PAYMENT LOG] reusing active payment_order', {
        paymentOrderId: existing.id,
        checkoutSessionId,
        razorpay_order_id: existing.order_id,
      })
      return NextResponse.json({
        paymentOrderId: existing.id,
        razorpay_key_id: keyId,
        razorpay_order_id: existing.order_id,
        razorpay_amount:
          typeof existing.metadata?.razorpay_amount === 'number'
            ? existing.metadata.razorpay_amount
            : amountCheck.minorUnits,
        currency,
        payableAmount: authority.payableAmount,
        walletCredit: serverWalletCredit,
        rewardPoints: serverRewardPoints,
        razorpayCharge: serverCharge,
        reused: true,
      })
    }

    // Authority changed (or no active order): expire prior unpaid rows, then create.
    if (existing) {
      await expireActivePaymentOrdersForSession(checkoutSessionId)
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
        checkout_session_id: checkoutSessionId,
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

    const inserted = await insertPaymentOrder({
      order_id: razorpayOrder.id,
      plan_id: planId,
      mobile_number: mobileNumber,
      operator_id: operatorId,
      country_id: countryId,
      amount: serverCharge,
      currency,
      status: 'created',
      user_id: userId || null,
      checkout_session_id: checkoutSessionId,
      pending_transaction_id: checkoutSessionId,
      metadata: {
        razorpay_amount: razorpayOrder.amount,
        used_wallet_balance: serverWalletCredit,
        wallet_currency: serverWalletCurrency,
        system_plan_id: systemPlanId || null,
        used_reward_points: serverRewardPoints,
        payable_amount: authority.payableAmount,
        pricing_source: 'server',
      },
    })

    if (!inserted.ok) {
      if (inserted.uniqueViolation) {
        const raced = await loadActivePaymentOrder(checkoutSessionId)
        if (raced) {
          return NextResponse.json({
            paymentOrderId: raced.id,
            razorpay_key_id: keyId,
            razorpay_order_id: raced.order_id,
            razorpay_amount:
              typeof raced.metadata?.razorpay_amount === 'number'
                ? raced.metadata.razorpay_amount
                : amountCheck.minorUnits,
            currency,
            payableAmount: authority.payableAmount,
            walletCredit: serverWalletCredit,
            rewardPoints: serverRewardPoints,
            razorpayCharge: serverCharge,
            reused: true,
          })
        }
      }
      return NextResponse.json({ error: 'Failed to persist payment order' }, { status: 500 })
    }

    const paymentOrderId = inserted.id

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
      const txnRows = txnRes.ok
        ? ((await txnRes.json()) as Array<{ metadata?: Record<string, unknown> }>)
        : []
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
          typeof txnMeta.selected_provider_name === 'string'
            ? txnMeta.selected_provider_name
            : undefined,
        selectedProviderPlanId:
          typeof txnMeta.selected_provider_plan_id === 'string'
            ? txnMeta.selected_provider_plan_id
            : undefined,
        selectedProviderCost:
          typeof txnMeta.selected_provider_cost === 'number' ? txnMeta.selected_provider_cost : null,
        selectedProviderCurrency:
          typeof txnMeta.selected_provider_currency === 'string'
            ? txnMeta.selected_provider_currency
            : null,
        routingResult: txnMeta.routing_result,
        lcrResult: txnMeta.lcr_result,
        providerSelectionTimestamp:
          typeof txnMeta.provider_selection_timestamp === 'string'
            ? txnMeta.provider_selection_timestamp
            : undefined,
        totalPayable: serverCharge,
        paymentCurrency: currency,
        checkoutPricing: checkoutPricingFromTxnMeta(txnMeta),
      })
    }

    console.log('[PAYMENT LOG] payment initiated', {
      paymentOrderId,
      checkoutSessionId,
      amount: serverCharge,
      currency,
      payableAmount: authority.payableAmount,
    })

    return NextResponse.json({
      paymentOrderId,
      razorpay_key_id: keyId,
      razorpay_order_id: razorpayOrder.id,
      razorpay_amount: razorpayOrder.amount,
      currency,
      payableAmount: authority.payableAmount,
      walletCredit: serverWalletCredit,
      rewardPoints: serverRewardPoints,
      razorpayCharge: serverCharge,
      reused: false,
    })
  } catch (error) {
    console.error('payment/razorpay/create-order:', error)
    return NextResponse.json({ error: 'Failed to create Razorpay order' }, { status: 500 })
  }
}
