import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  const user = getRequestUser(request)
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Query wallets table for user_id
    const res = await supabaseRest(`wallets?user_id=eq.${encodeURIComponent(user.id)}&select=balance,currency`, {
      cache: 'no-store'
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to load wallet' }, { status: 500 })
    }

    const wallets = await res.json()
    if (wallets.length === 0) {
      // If no wallet exists, create one with default balance 0
      const createRes = await supabaseRest('wallets', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([{ user_id: user.id, currency: 'USD', balance: 0 }]),
      })
      if (!createRes.ok) {
        return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 })
      }
      return NextResponse.json({ balance: 0, currency: 'USD' })
    }

    const wallet = wallets[0]
    return NextResponse.json({ balance: Number(wallet.balance) || 0, currency: wallet.currency || 'USD' })
  } catch (error) {
    console.error('Failed to get wallet balance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
