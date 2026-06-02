import { NextResponse } from 'next/server'
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

type TransactionRow = {
  id: string
  user_id: string | null
  type: string
  amount: number | string
  currency: string
  status: string
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

function mapTransaction(row: TransactionRow) {
  return {
    id: row.id,
    userId: row.user_id ?? '',
    type: row.type,
    amount: Number(row.amount) || 0,
    currency: row.currency,
    status: row.status,
    description: row.description ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const res = await supabaseRest(
      `transactions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,type,amount,currency,status,description,metadata,created_at&order=created_at.desc`,
      { cache: 'no-store' },
    )
    if (!res.ok) return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })
    const transactions = ((await res.json()) as TransactionRow[]).map(mapTransaction)
    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('profile/transactions:', error)
    return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })
  }
}
