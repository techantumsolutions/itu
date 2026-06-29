import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { executeCheckout } from '@/lib/topup/checkout-service'
import { linkPaymentOrderToCheckoutSession } from '@/lib/topup/prepare-checkout-service'
import { redeemPoints } from '@/lib/rewards/reward-service'

export async function POST(request: Request) {
  const user = getRequestUser(request)
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
    const systemPlanId = typeof body.systemPlanId === 'string' ? body.systemPlanId.trim() : ''
    const mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.trim() : ''
    const operatorId = typeof body.operatorId === 'string' ? body.operatorId.trim() : ''
    const countryId = typeof body.countryId === 'string' ? body.countryId.trim() : ''
    const amount = Number(body.amount)
    const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD'
    const checkoutSessionId = typeof body.checkoutSessionId === 'string' ? body.checkoutSessionId.trim() : ''

    if (!planId || !mobileNumber || !operatorId || !countryId || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
    if (!checkoutSessionId) {
      return NextResponse.json({ error: 'Missing checkoutSessionId — provider must be selected before payment' }, { status: 400 })
    }

    // 1. Fetch wallet max consumption percentage from settings
    let maxConsumptionPercentage = 100
    const settingsRes = await supabaseRest('app_settings?key=eq.wallet_max_consumption_percentage&select=value&limit=1', {
      cache: 'no-store'
    })
    if (settingsRes.ok) {
      const rows = await settingsRes.json().catch(() => [])
      if (rows?.[0]?.value !== undefined) {
        maxConsumptionPercentage = Number(rows[0].value) ?? 100
      }
    }

    const selectedWalletCurrency = typeof body.walletCurrency === 'string' ? body.walletCurrency.trim().toUpperCase() : ''

    // 2. Fetch user's wallet
    let walletQuery = `wallets?user_id=eq.${encodeURIComponent(user.id)}`
    if (selectedWalletCurrency) {
      walletQuery += `&currency=eq.${encodeURIComponent(selectedWalletCurrency)}`
    }
    const walletRes = await supabaseRest(walletQuery, {
      cache: 'no-store'
    })
    if (!walletRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch wallet information' }, { status: 500 })
    }

    const wallets = await walletRes.json().catch(() => [])
    if (wallets.length === 0) {
      return NextResponse.json({ error: `Insufficient wallet balance (No ${selectedWalletCurrency || 'default'} wallet found)` }, { status: 400 })
    }

    const wallet = wallets[0]
    const walletBalance = Number(wallet.balance) || 0
    const walletCurrency = wallet.currency || 'USD'

    // 3. Convert wallet balance to payment currency if different
    let convertedWalletBalance = walletBalance
    if (walletCurrency !== currency) {
      const rateRes = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' })
      if (rateRes.ok) {
        const data = await rateRes.json()
        const rates = data?.rates
        if (rates && rates[walletCurrency] && rates[currency]) {
          const rateToEUR = 1 / rates[walletCurrency]
          const rateFromEUR = rates[currency]
          convertedWalletBalance = walletBalance * rateToEUR * rateFromEUR
        }
      }
    }

    // 3.5. Retrieve and validate reward points settings if points are being used
    const usedRewardPoints = Number(body.usedRewardPoints) || 0
    let pointsWorthInPayCurrency = 0

    if (usedRewardPoints > 0) {
      let pointsBalance = 0
      const balRes = await supabaseRest(`reward_accounts?user_id=eq.${encodeURIComponent(user.id)}&select=points_balance&limit=1`, { cache: 'no-store' })
      if (balRes.ok) {
        const rows = await balRes.json()
        if (rows.length > 0) {
          pointsBalance = Number(rows[0].points_balance) || 0
        }
      }

      if (pointsBalance < usedRewardPoints) {
        return NextResponse.json({ error: 'Insufficient reward points balance' }, { status: 400 })
      }

      let pointUSDValue = 0.01
      const usdValRes = await supabaseRest('app_settings?key=eq.reward_point_usd_value&select=value&limit=1', { cache: 'no-store' })
      if (usdValRes.ok) {
        const rows = await usdValRes.json()
        if (rows[0]?.value != null) {
          pointUSDValue = Number(rows[0].value) || 0.01
        }
      }

      let maxRedemptionPct = 50
      const maxPctRes = await supabaseRest('app_settings?key=eq.reward_max_redemption_percentage&select=value&limit=1', { cache: 'no-store' })
      if (maxPctRes.ok) {
        const rows = await maxPctRes.json()
        if (rows[0]?.value != null) {
          maxRedemptionPct = Number(rows[0].value) ?? 50
        }
      }

      const pointsUSDWorth = usedRewardPoints * pointUSDValue
      pointsWorthInPayCurrency = pointsUSDWorth
      if (currency !== 'USD') {
        const rateRes = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' })
        if (rateRes.ok) {
          const data = await rateRes.json()
          const rates = data?.rates
          if (rates && rates['USD'] && rates[currency]) {
            const rateToEUR = 1 / rates['USD']
            const rateFromEUR = rates[currency]
            pointsWorthInPayCurrency = pointsUSDWorth * rateToEUR * rateFromEUR
          }
        }
      }

      const maxPointsAllowed = Math.floor(pointsBalance * (maxRedemptionPct / 100))
      if (usedRewardPoints > maxPointsAllowed) {
        return NextResponse.json({ error: 'Exceeds maximum reward points redemption percentage limit' }, { status: 400 })
      }
    }

    const adjustedAmount = Math.max(0, amount - pointsWorthInPayCurrency)

    // Enforce max consumption limit based on available wallet balance (using the adjusted wallet deduction)
    const maxAllowed = convertedWalletBalance * (maxConsumptionPercentage / 100)
    if (adjustedAmount > maxAllowed + 0.01) {
      return NextResponse.json({ error: 'Exceeds maximum wallet consumption limit' }, { status: 400 })
    }

    if (convertedWalletBalance < adjustedAmount - 0.01) {
      return NextResponse.json({ error: 'Insufficient wallet balance' }, { status: 400 })
    }

    // 4. Create a dummy payment_orders record
    const dummyOrderId = `wallet-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    const poRes = await supabaseRest('payment_orders?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          order_id: dummyOrderId,
          plan_id: planId,
          mobile_number: mobileNumber,
          operator_id: operatorId,
          country_id: countryId,
          amount: 0,
          currency: currency,
          status: 'paid',
          user_id: user.id,
          metadata: {
            is_wallet_only: true,
            wallet_deduction: adjustedAmount,
            wallet_currency: walletCurrency,
            used_reward_points: usedRewardPoints,
            reward_points_deduction_amount: pointsWorthInPayCurrency,
          },
        },
      ]),
    })

    const poRows = poRes.ok ? ((await poRes.json()) as Array<{ id: string }>) : []
    const paymentOrderId = poRows[0]?.id
    if (!paymentOrderId) {
      return NextResponse.json({ error: 'Failed to record checkout order' }, { status: 500 })
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
    })

    console.log('[PAYMENT LOG] wallet payment initiated', { paymentOrderId, checkoutSessionId, amount, currency, adjustedAmount })

    // 5. Create the wallet deduction transaction if there is any wallet balance used
    if (adjustedAmount > 0) {
      if (walletCurrency !== currency) {
        const rateRes = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' }).catch(() => null)
        let walletDeductionAmt = adjustedAmount
        if (rateRes?.ok) {
          const data = await rateRes.json()
          const rates = data?.rates
          if (rates && rates[walletCurrency] && rates[currency]) {
            const rateToEUR = 1 / rates[currency]
            const rateFromEUR = rates[walletCurrency]
            walletDeductionAmt = adjustedAmount * rateToEUR * rateFromEUR
          }
        }

        // Debit from the walletCurrency wallet
        await supabaseRest('transactions', {
          method: 'POST',
          body: JSON.stringify([{
            user_id: user.id,
            type: 'payment',
            amount: walletDeductionAmt,
            currency: walletCurrency,
            status: 'completed',
            description: `Recharge ${mobileNumber}`,
            metadata: {
              plan_id: planId,
              mobile_number: mobileNumber,
              operator_id: operatorId,
              country_id: countryId,
              payment_order_id: paymentOrderId,
              razorpay_payment_id: 'wallet',
            }
          }])
        }).catch((err) => console.error('Failed to insert wallet-only exchange debit:', err))

        // Credit to the payment currency wallet
        await supabaseRest('transactions', {
          method: 'POST',
          body: JSON.stringify([{
            user_id: user.id,
            type: 'topup',
            amount: adjustedAmount,
            currency: currency,
            status: 'completed',
            description: `Exchange credit from ${walletCurrency} wallet for order ${dummyOrderId}`,
            metadata: {
              hide_from_user: true,
            }
          }])
        }).catch((err) => console.error('Failed to insert wallet-only exchange credit:', err))
      } else {
        // Debit from the walletCurrency wallet immediately for same currency
        await supabaseRest('transactions', {
          method: 'POST',
          body: JSON.stringify([{
            user_id: user.id,
            type: 'payment',
            amount: adjustedAmount,
            currency: walletCurrency,
            status: 'completed',
            description: `Recharge ${mobileNumber}`,
            metadata: {
              plan_id: planId,
              mobile_number: mobileNumber,
              operator_id: operatorId,
              country_id: countryId,
              payment_order_id: paymentOrderId,
              razorpay_payment_id: 'wallet',
              hide_from_user: true,
            }
          }])
        }).catch((err) => console.error('Failed to insert wallet-only same-currency debit:', err))
      }
    }

    // 6. Execute checkout directly
    const result = await executeCheckout({
      paymentOrderId,
      planId,
      systemPlanId: systemPlanId || undefined,
      mobileNumber,
      operatorId,
      countryId,
      amount,
      currency,
      razorpayPaymentId: `wallet-${paymentOrderId}`,
      userId: user.id,
      hideTransactionFromUser: walletCurrency !== currency,
      usedWalletBalance: adjustedAmount,
      walletCurrency: walletCurrency,
      checkoutSessionId,
      pendingTransactionId: checkoutSessionId,
    })

    if (result.ok && usedRewardPoints > 0) {
      const pointsResult = await redeemPoints(
        user.id,
        result.transactionId || checkoutSessionId || null,
        usedRewardPoints,
        `Redeemed on recharge ${mobileNumber}`
      )
      if (!pointsResult) {
        console.error('[REWARDS] Failed to deduct user points after successful wallet checkout')
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
      rewardPointsEarned: result.rewardPointsEarned ?? 0,
    })
  } catch (error) {
    console.error('Wallet checkout processing failed:', error)
    return NextResponse.json({ error: 'Wallet checkout failed' }, { status: 500 })
  }
}
