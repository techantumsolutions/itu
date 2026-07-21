import { NextResponse } from 'next/server'
import { settleRazorpayPayment } from '@/lib/wallet/application/settle-razorpay-payment'

/** HTTP adapter — Razorpay verify / settlement orchestration lives in lib/wallet. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const razorpay_order_id =
      typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id.trim() : ''
    const razorpay_payment_id =
      typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id.trim() : ''
    const razorpay_signature =
      typeof body.razorpay_signature === 'string' ? body.razorpay_signature.trim() : ''
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    const paymentOrderId =
      typeof body.paymentOrderId === 'string' ? body.paymentOrderId.trim() : ''

    const result = await settleRazorpayPayment({
      request,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paymentOrderId: paymentOrderId || undefined,
      orderId: orderId || undefined,
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error('razorpay/verify:', error)
    return NextResponse.json({ ok: false, error: 'Verification failed' }, { status: 500 })
  }
}
