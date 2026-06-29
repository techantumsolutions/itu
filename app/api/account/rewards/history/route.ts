import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest } from '@/lib/db/supabase-rest'

/**
 * GET /api/account/rewards/history
 * Returns the logged-in user's reward ledger entries with linked transaction details.
 */
export async function GET(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userId = ctx.user.id

    // Fetch ledger entries for this user, ordered newest first, with transaction join
    const ledgerRes = await supabaseRest(
      `reward_ledger?user_id=eq.${encodeURIComponent(userId)}&select=id,points,reason,metadata,created_at,transaction_id,transactions(id,amount,currency,status,description,metadata)&order=created_at.desc&limit=50`,
      { cache: 'no-store' }
    )
    if (!ledgerRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch reward history' }, { status: 500 })
    }
    const entries = await ledgerRes.json()

    // Fetch point valuation from app_settings
    const settingsRes = await supabaseRest(
      'app_settings?key=eq.reward_point_usd_value&select=value&limit=1',
      { cache: 'no-store' }
    )
    let pointValue = 0.01 // default
    if (settingsRes.ok) {
      const rows = await settingsRes.json()
      if (rows[0]?.value != null) {
        pointValue = typeof rows[0].value === 'number' ? rows[0].value : Number(rows[0].value) || 0.01
      }
    }

    // Fetch user's current points balance
    const balanceRes = await supabaseRest(
      `reward_accounts?user_id=eq.${encodeURIComponent(userId)}&select=points_balance&limit=1`,
      { cache: 'no-store' }
    )
    let balance = 0
    if (balanceRes.ok) {
      const bRows = await balanceRes.json()
      balance = bRows[0]?.points_balance ?? 0
    }

    const maxPctRes = await supabaseRest(
      'app_settings?key=eq.reward_max_redemption_percentage&select=value&limit=1',
      { cache: 'no-store' }
    )
    let maxRedemptionPercentage = 50 // default
    if (maxPctRes.ok) {
      const rows = await maxPctRes.json()
      if (rows[0]?.value != null) {
        maxRedemptionPercentage = Number(rows[0].value) ?? 50
      }
    }

    return NextResponse.json({
      entries,
      pointValue,
      balance,
      balanceWorth: +(balance * pointValue).toFixed(2),
      maxRedemptionPercentage,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
