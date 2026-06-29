import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'

export async function GET(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const res = await supabaseRest('app_settings?key=eq.reward_point_usd_value&select=value&limit=1', { cache: 'no-store' })
    let usdValue = 0.01 // default fallback
    if (res.ok) {
      const rows = await res.json()
      if (rows.length > 0) {
        usdValue = Number(rows[0].value) || 0.01
      }
    }

    const maxPctRes = await supabaseRest('app_settings?key=eq.reward_max_redemption_percentage&select=value&limit=1', { cache: 'no-store' })
    let maxRedemptionPercentage = 50 // default fallback to 50%
    if (maxPctRes.ok) {
      const rows = await maxPctRes.json()
      if (rows.length > 0) {
        maxRedemptionPercentage = Number(rows[0].value) ?? 50
      }
    }

    return NextResponse.json({ usdValue, maxRedemptionPercentage })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const usdValue = Number(body.usdValue)
    const maxRedemptionPercentage = Number(body.maxRedemptionPercentage)

    if (body.usdValue !== undefined && (isNaN(usdValue) || usdValue <= 0)) {
      return NextResponse.json({ error: 'usdValue must be a positive number' }, { status: 400 })
    }
    if (body.maxRedemptionPercentage !== undefined && (isNaN(maxRedemptionPercentage) || maxRedemptionPercentage < 0 || maxRedemptionPercentage > 100)) {
      return NextResponse.json({ error: 'maxRedemptionPercentage must be a number between 0 and 100' }, { status: 400 })
    }

    const payload: Array<{ key: string; value: any; updated_at: string }> = []
    if (body.usdValue !== undefined) {
      payload.push({
        key: 'reward_point_usd_value',
        value: usdValue,
        updated_at: new Date().toISOString(),
      })
    }
    if (body.maxRedemptionPercentage !== undefined) {
      payload.push({
        key: 'reward_max_redemption_percentage',
        value: maxRedemptionPercentage,
        updated_at: new Date().toISOString(),
      })
    }

    if (payload.length > 0) {
      const res = await supabaseRest('app_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        return NextResponse.json({ error: await res.text() }, { status: 500 })
      }
    }

    await logAdminActivity({
      action: 'Update Reward Settings',
      pageName: 'System Settings',
      details: { usdValue, maxRedemptionPercentage },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
