import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'wallet.view')
  if (denied) return denied

  try {
    const res = await supabaseRest('app_settings?key=eq.wallet_max_consumption_percentage&select=value&limit=1', { cache: 'no-store' })
    let percentage = 100
    if (res.ok) {
      const rows = await res.json()
      if (rows.length > 0 && rows[0].value !== undefined) {
        percentage = Number(rows[0].value) ?? 100
      }
    }
    return NextResponse.json({ percentage })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'wallet.manage')
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const percentage = Number(body.percentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      return NextResponse.json({ error: 'Percentage must be between 0 and 100' }, { status: 400 })
    }

    const res = await supabaseRest('app_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        {
          key: 'wallet_max_consumption_percentage',
          value: percentage,
          updated_at: new Date().toISOString(),
        },
      ]),
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Update Wallet Max Consumption Percentage',
      pageName: 'System Settings',
      details: { percentage },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
