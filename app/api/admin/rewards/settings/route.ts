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
    return NextResponse.json({ usdValue })
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
    if (isNaN(usdValue) || usdValue <= 0) {
      return NextResponse.json({ error: 'usdValue must be a positive number' }, { status: 400 })
    }

    const res = await supabaseRest('app_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        {
          key: 'reward_point_usd_value',
          value: usdValue,
          updated_at: new Date().toISOString(),
        },
      ]),
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Update Reward Point Valuation',
      pageName: 'System Settings',
      details: { usdValue },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
