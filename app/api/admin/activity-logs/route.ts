import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.view')
  if (denied) return denied

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
