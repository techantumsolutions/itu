import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function POST(request: Request) {
  const user = getRequestUser(request)
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const amount = Number(body.amount)
  const description = typeof body.description === 'string' ? body.description : 'Wallet debit'
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD'
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

  const res = await supabaseRest('transactions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ user_id: user.id, type: 'recharge', amount, currency, status: 'completed', description, metadata }]),
  })
  if (!res.ok) return NextResponse.json({ error: 'Failed to persist debit' }, { status: 500 })
  const rows = (await res.json().catch(() => [])) as Array<{ id: string }>
  const transactionId = rows[0]?.id ?? ''
  return NextResponse.json({ ok: true, transactionId })
}
