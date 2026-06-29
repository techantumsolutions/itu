import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const { name, trigger, points, scope, is_active, currency } = body

    if (!name?.trim() || !trigger || typeof points !== 'number') {
      return NextResponse.json({ error: 'name, trigger, and points are required' }, { status: 400 })
    }

    const res = await supabaseRest(`reward_rules?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: name.trim(),
        trigger,
        points,
        scope: scope || {},
        is_active: is_active ?? true,
        currency: typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : undefined,
        updated_at: new Date().toISOString(),
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    const rows = await res.json()
    const rule = rows[0]

    await logAdminActivity({
      action: 'Update Reward Rule',
      pageName: 'System Settings',
      details: { ruleId: id, rule },
    })

    return NextResponse.json({ rule })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  try {
    const res = await supabaseRest(`reward_rules?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Delete Reward Rule',
      pageName: 'System Settings',
      details: { ruleId: id },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
