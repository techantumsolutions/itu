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
    const res = await supabaseRest(`app_settings?key=eq.page_passwords&select=value&limit=1`)
    let passwords: Record<string, string> = {}
    if (res.ok) {
      const rows = (await res.json().catch(() => [])) as { value: Record<string, string> }[]
      if (rows && rows.length > 0 && rows[0]?.value) {
        passwords = rows[0].value
      }
    }

    if (ctx.user.role === 'super_admin') {
      return NextResponse.json({ passwords })
    } else {
      // For limited admins, only send the list of paths that are protected (not the passwords themselves!)
      const protectedPaths = Object.keys(passwords).filter((p) => !!passwords[p])
      return NextResponse.json({ protectedPaths })
    }
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
    const body = (await request.json().catch(() => ({}))) as { passwords?: Record<string, string> }
    const passwords = body.passwords ?? {}

    // Save mapping in app_settings table
    const res = await supabaseRest('app_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        {
          key: 'page_passwords',
          value: passwords,
          updated_at: new Date().toISOString(),
        },
      ]),
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Update Page Passwords',
      pageName: 'Passwords',
      details: { paths: Object.keys(passwords) },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed_to_save' }, { status: 400 })
  }
}
