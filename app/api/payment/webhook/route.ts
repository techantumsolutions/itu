import { NextResponse } from 'next/server'
import { updateOrderDb } from '@/lib/topup/orders-db'

export async function POST(request: Request) {
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

