import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getOrderDb, updateOrderDb } from '@/lib/topup/orders-db'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { executeCheckout } from '@/lib/topup/checkout-service'

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
      // Mark payment_orders as paid
      await supabaseRest(`payment_orders?id=eq.${enc(paymentOrderId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'paid', payment_id: razorpay_payment_id }),
      })

      // Load payment order details for checkout execution
      const poRes = await supabaseRest(
        `payment_orders?id=eq.${enc(paymentOrderId)}&select=id,plan_id,mobile_number,operator_id,country_id,amount,currency&limit=1`,
        { cache: 'no-store' },
      )
      const poRows = poRes.ok ? ((await poRes.json()) as Array<Record<string, unknown>>) : []
      const po = poRows[0]

      if (!po) {
        return NextResponse.json({ ok: false, error: 'Payment order not found' }, { status: 404 })
      }

      // Execute full checkout: transaction → routing → provider → recharge
      const result = await executeCheckout({
        paymentOrderId,
        planId: String(po.plan_id ?? ''),
        mobileNumber: String(po.mobile_number ?? ''),
        operatorId: String(po.operator_id ?? ''),
        countryId: String(po.country_id ?? ''),
        amount: Number(po.amount ?? 0),
        currency: String(po.currency ?? 'INR'),
        razorpayPaymentId: razorpay_payment_id,
      })

      return NextResponse.json({
        ok: result.ok,
        transactionId: result.transactionId,
        providerRef: result.providerRef,
        providerName: result.providerName,
        status: result.status,
        error: result.error,
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

