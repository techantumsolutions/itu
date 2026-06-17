import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest } from '@/lib/db/supabase-rest'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const res = await supabaseRest('admin_activity_logs?select=*,profiles(name)&order=created_at.desc&limit=100', {
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    const logs = await res.json()
    return NextResponse.json({ logs })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed_to_fetch_activity_logs' },
      { status: 500 },
    )
  }
}
