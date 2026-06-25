import { NextResponse } from 'next/server'
import { createOrderDb, getOrderDb, updateOrderDb } from '@/lib/topup/orders-db'
import Razorpay from 'razorpay'
import { toRazorpayMinorUnits } from '@/lib/payments/razorpay-amount'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    // If client already has an orderId, return gateway payload for that order (Razorpay init step).
    const existingOrderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (existingOrderId) {
      const existing = await getOrderDb(existingOrderId)
      if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // For this repo we don’t persist full order details server-side beyond memory;
      // payment page uses this endpoint only to get Razorpay params.
      const keyId = process.env.RAZORPAY_KEY_ID
      const keySecret = process.env.RAZORPAY_KEY_SECRET
      if (!keyId || !keySecret) {
        return NextResponse.json({ error: 'Razorpay keys missing' }, { status: 500 })
      }
      // For now, the payment page sends the orderId only after create-order; it also has totals locally.
      // We generate a Razorpay order for a fixed minimal amount if amount is not provided (should be provided).
      const amount = typeof body.amount === 'number' ? body.amount : 0
      const currency = typeof body.currency === 'string' ? body.currency : 'INR'
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
      const razorpayOrder = await razorpay.orders.create({
        amount: toRazorpayMinorUnits(amount, currency),
        currency,
        receipt: existingOrderId,
        notes: { topup_order_id: existingOrderId },
      })
      await updateOrderDb(existingOrderId, { razorpay_order_id: razorpayOrder.id, payment_gateway: 'razorpay' })
      return NextResponse.json({
        orderId: existingOrderId,
        payment_gateway: 'razorpay',
        razorpay_key_id: keyId,
        razorpay_order_id: razorpayOrder.id,
        razorpay_amount: razorpayOrder.amount,
      })
    }

    const phone_number = typeof body.phone_number === 'string' ? body.phone_number.trim() : ''
    const operator = typeof body.operator === 'string' ? body.operator.trim() : ''
    const country = typeof body.country === 'string' ? body.country.trim().toUpperCase() : ''
    const plan_id = typeof body.plan_id === 'string' ? body.plan_id.trim() : ''
    const amount = typeof body.amount === 'number' ? body.amount : 0
    const fee = typeof body.fee === 'number' ? body.fee : 0
    const total = typeof body.total === 'number' ? body.total : 0
    const currency = typeof body.currency === 'string' ? body.currency : 'EUR'

    if (!phone_number || !operator || !country || !plan_id || !total) {
      return NextResponse.json({ error: 'Missing order fields' }, { status: 400 })
    }

    const order = await createOrderDb({
      phone_number,
      operator,
      country,
      plan_id,
      amount,
      fee,
      total,
      currency,
      status: 'pending',
      payment_gateway: currency === 'INR' ? 'razorpay' : 'stripe',
    })

    // If INR, create a Razorpay order immediately so the next page can open checkout.
    if (order.payment_gateway === 'razorpay') {
      const keyId = process.env.RAZORPAY_KEY_ID
      const keySecret = process.env.RAZORPAY_KEY_SECRET
      if (!keyId || !keySecret) {
        return NextResponse.json({ error: 'Razorpay keys missing' }, { status: 500 })
      }
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(order.total * 100),
        currency: 'INR',
        receipt: order.id,
        notes: { topup_order_id: order.id },
      })
      await updateOrderDb(order.id, { razorpay_order_id: razorpayOrder.id })
      return NextResponse.json({
        orderId: order.id,
        payment_gateway: 'razorpay',
        razorpay_key_id: keyId,
        razorpay_order_id: razorpayOrder.id,
        razorpay_amount: razorpayOrder.amount,
      })
    }

    // Stripe integration (later): return client_secret / hosted URL.
    return NextResponse.json({ orderId: order.id, payment_gateway: 'stripe', payment_url: null, client_secret: null })
  } catch (error) {
    console.error('payment/create-session:', error)
    return NextResponse.json({ error: 'Failed to create payment session' }, { status: 500 })
  }
}

