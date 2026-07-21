import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.view')
  if (denied) return denied

  try {
    // PostgREST join to get profile info alongside rewards account info
    const res = await supabaseRest('reward_accounts?select=points_balance,updated_at,profiles(email,name)&order=points_balance.desc', { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch reward accounts' }, { status: 500 })
    }
    const accounts = await res.json()
    return NextResponse.json({ accounts })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
