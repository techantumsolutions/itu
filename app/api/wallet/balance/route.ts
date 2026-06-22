import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  const user = getRequestUser(request)
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // 1. Fetch user profile to get their preferred currency
    const profileRes = await supabaseRest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=currency&limit=1`, {
      cache: 'no-store'
    })
    let preferredCurrency = 'USD'
    if (profileRes.ok) {
      const rows = await profileRes.json().catch(() => [])
      if (rows?.[0]?.currency) {
        preferredCurrency = rows[0].currency
      }
    }

    // 2. Fetch max consumption percentage from settings
    let maxConsumptionPercentage = 100
    const settingsRes = await supabaseRest('app_settings?key=eq.wallet_max_consumption_percentage&select=value&limit=1', {
      cache: 'no-store'
    })
    if (settingsRes.ok) {
      const rows = await settingsRes.json().catch(() => [])
      if (rows?.[0]?.value !== undefined) {
        maxConsumptionPercentage = Number(rows[0].value) ?? 100
      }
    }

    // 3. Query wallets table for user_id and preferredCurrency
    const res = await supabaseRest(`wallets?user_id=eq.${encodeURIComponent(user.id)}&currency=eq.${encodeURIComponent(preferredCurrency)}&select=balance,currency&limit=1`, {
      cache: 'no-store'
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to load wallet' }, { status: 500 })
    }

    const wallets = await res.json().catch(() => [])
    if (wallets.length === 0) {
      // If no wallet exists for this currency, create one with default balance 0
      const createRes = await supabaseRest('wallets', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([{ user_id: user.id, currency: preferredCurrency, balance: 0 }]),
      })
      if (!createRes.ok) {
        return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 })
      }
      return NextResponse.json({ balance: 0, currency: preferredCurrency, maxConsumptionPercentage })
    }

    const wallet = wallets[0]
    return NextResponse.json({ balance: Number(wallet.balance) || 0, currency: wallet.currency || preferredCurrency, maxConsumptionPercentage })
  } catch (error) {
    console.error('Failed to get wallet balance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
