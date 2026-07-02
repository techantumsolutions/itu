import { NextResponse } from 'next/server'
import { requireBearerSecret } from '@/lib/security/require-secret'
import { updateOrderDb } from '@/lib/topup/orders-db'

export async function POST(request: Request) {
  const denied = requireBearerSecret(request, 'PAYMENT_WEBHOOK_SECRET', {
    missingMessage: 'PAYMENT_WEBHOOK_SECRET is not configured',
    unauthorizedMessage: 'Unauthorized webhook request',
  })
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    const status = body.status === 'success' ? 'success' : body.status === 'failed' ? 'failed' : 'pending'

    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
    const updated = await updateOrderDb(orderId, { status })
    if (!updated) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('payment/webhook:', error)
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 })
  }
}
