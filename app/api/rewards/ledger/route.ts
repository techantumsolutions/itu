import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function POST(request: Request) {
  const user = getRequestUser(request)
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const points = Number(body.points)
  if (!Number.isFinite(points) || points === 0) return NextResponse.json({ error: 'Invalid points' }, { status: 400 })

  const res = await supabaseRest('reward_ledger', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ user_id: user.id, points, reason: `Order ${body.orderId ?? ''}`.trim(), metadata: { orderId: body.orderId } }]),
  })
  if (!res.ok) return NextResponse.json({ error: 'Failed to persist rewards' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
