import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'

export async function GET(request: Request) {
  try {
    const res = await supabaseRest(`app_settings?key=eq.global_2fa_settings&select=value&limit=1`)
    let enabled = false
    if (res.ok) {
      const rows = (await res.json().catch(() => [])) as { value: { enabled?: boolean } }[]
      if (rows && rows.length > 0 && rows[0]?.value) {
        enabled = Boolean(rows[0].value.enabled)
      }
    }
    return NextResponse.json({ enabled })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed_to_fetch' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { enabled?: boolean }
    const enabled = Boolean(body.enabled)

    // Save global 2fa state in app_settings table
    const res = await supabaseRest('app_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        {
          key: 'global_2fa_settings',
          value: { enabled },
          updated_at: new Date().toISOString(),
        },
      ]),
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    await logAdminActivity({
      action: enabled ? 'Enable Global 2FA' : 'Disable Global 2FA',
      pageName: 'Security',
      details: { enabled },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed_to_save' }, { status: 400 })
  }
}
