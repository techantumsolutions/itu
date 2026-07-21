import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.view')
  if (denied) return denied

  try {
    // PostgREST join to get ledger logs alongside profile info
    const res = await supabaseRest(
      'reward_ledger?select=id,points,reason,created_at,profiles(email,name)&order=created_at.desc&limit=100',
      { cache: 'no-store' },
    )
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch reward ledger' }, { status: 500 })
    }
    const logs = await res.json()
    return NextResponse.json({ logs })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
