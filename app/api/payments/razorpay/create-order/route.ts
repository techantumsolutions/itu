import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'

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
    const amount = typeof body.amount === 'number' ? body.amount : 0
    const currency = typeof body.currency === 'string' ? body.currency.trim() : 'INR'
    const mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.trim() : ''
    const operatorId = typeof body.operatorId === 'string' ? body.operatorId.trim() : ''
    const countryId = typeof body.countryId === 'string' ? body.countryId.trim() : ''

    if (!planId || !amount || !mobileNumber) {
      return NextResponse.json({ error: 'Missing required fields: planId, amount, mobileNumber' }, { status: 400 })
    }

    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay keys not configured' }, { status: 500 })
    }

    // Create Razorpay order
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // convert to paise
      currency,
      notes: {
        plan_id: planId,
        mobile_number: mobileNumber,
        operator_id: operatorId,
        country_id: countryId,
      },
    })

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
          },
        },
      ]),
    })
    const dbRows = dbRes.ok ? ((await dbRes.json()) as Array<{ id: string }>) : []
    const paymentOrderId = dbRows[0]?.id ?? ''

    return NextResponse.json({
      paymentOrderId,
      razorpay_key_id: keyId,
      razorpay_order_id: razorpayOrder.id,
      razorpay_amount: razorpayOrder.amount,
      currency,
    })
  } catch (error) {
    console.error('payments/razorpay/create-order:', error)
    return NextResponse.json({ error: 'Failed to create Razorpay order' }, { status: 500 })
  }
}
