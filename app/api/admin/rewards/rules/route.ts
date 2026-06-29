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
    const res = await supabaseRest('reward_rules?select=*&order=created_at.desc', { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 })
    }
    const rules = await res.json()
    return NextResponse.json({ rules })
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
    const { name, trigger, points, scope, is_active, currency } = body

    if (!name?.trim() || !trigger || typeof points !== 'number') {
      return NextResponse.json({ error: 'name, trigger, and points are required' }, { status: 400 })
    }

    const res = await supabaseRest('reward_rules?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          name: name.trim(),
          trigger,
          points,
          scope: scope || {},
          is_active: is_active ?? true,
          currency: typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD',
        },
      ]),
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    const rows = await res.json()
    const rule = rows[0]

    await logAdminActivity({
      action: 'Create Reward Rule',
      pageName: 'System Settings',
      details: { rule },
    })

    return NextResponse.json({ rule }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
