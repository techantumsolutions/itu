import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function POST(request: Request) {
  const user = getRequestUser(request)
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const amount = Number(body.amount)
  const currency = typeof body.currency === 'string' ? body.currency : 'USD'
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

  const res = await supabaseRest('transactions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ user_id: user.id, type: 'topup', amount, currency, status: 'completed', description: 'Wallet top-up' }]),
  })
  if (!res.ok) return NextResponse.json({ error: 'Failed to persist top-up' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
