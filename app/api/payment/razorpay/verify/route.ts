import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getOrderDb, updateOrderDb } from '@/lib/topup/orders-db'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    const razorpay_order_id = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id.trim() : ''
    const razorpay_payment_id = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id.trim() : ''
    const razorpay_signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature.trim() : ''

    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ ok: false, error: 'Missing Razorpay fields' }, { status: 400 })
    }

    const order = await getOrderDb(orderId)
    if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })

    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) return NextResponse.json({ ok: false, error: 'Razorpay secret missing' }, { status: 500 })

    // Validate the Razorpay signature: HMAC_SHA256(order_id|payment_id, key_secret)
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')

    if (expected !== razorpay_signature) {
      await updateOrderDb(orderId, { status: 'failed', razorpay_order_id, razorpay_payment_id, payment_gateway: 'razorpay' })
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
    }

    await updateOrderDb(orderId, {
      status: 'success',
      razorpay_order_id,
      razorpay_payment_id,
      payment_gateway: 'razorpay',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('razorpay/verify:', error)
    return NextResponse.json({ ok: false, error: 'Verification failed' }, { status: 500 })
  }
}

