import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { executeCheckout } from '@/lib/topup/checkout-service'

export async function POST(request: Request) {
  const user = getRequestUser(request)
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
    const mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.trim() : ''
    const operatorId = typeof body.operatorId === 'string' ? body.operatorId.trim() : ''
    const countryId = typeof body.countryId === 'string' ? body.countryId.trim() : ''
    const amount = Number(body.amount)
    const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD'

    if (!planId || !mobileNumber || !operatorId || !countryId || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
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

    // Enforce max consumption limit
    const maxAllowed = amount * (maxConsumptionPercentage / 100)
    if (amount > maxAllowed + 0.01) {
      return NextResponse.json({ error: 'Exceeds maximum wallet consumption limit' }, { status: 400 })
    }

    // 2. Fetch user's wallet
    const walletRes = await supabaseRest(`wallets?user_id=eq.${encodeURIComponent(user.id)}&select=balance,currency`, {
      cache: 'no-store'
    })
    if (!walletRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch wallet information' }, { status: 500 })
    }

    const wallets = await walletRes.json().catch(() => [])
    if (wallets.length === 0) {
      return NextResponse.json({ error: 'Insufficient wallet balance (No wallet found)' }, { status: 400 })
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

    if (convertedWalletBalance < amount - 0.01) {
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
            wallet_deduction: amount,
          },
        },
      ]),
    })

    const poRows = poRes.ok ? ((await poRes.json()) as Array<{ id: string }>) : []
    const paymentOrderId = poRows[0]?.id
    if (!paymentOrderId) {
      return NextResponse.json({ error: 'Failed to record checkout order' }, { status: 500 })
    }

    // 5. Execute checkout directly
    const result = await executeCheckout({
      paymentOrderId,
      planId,
      mobileNumber,
      operatorId,
      countryId,
      amount,
      currency,
      razorpayPaymentId: 'wallet',
      userId: user.id,
    })

    return NextResponse.json({
      ok: result.ok,
      transactionId: result.transactionId,
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
