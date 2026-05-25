import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest, isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import { ADMIN_FEATURE_KEYS } from '@/lib/auth/admin-features'

function mergePermissions(input: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const base: Record<string, boolean> = {}
  for (const k of ADMIN_FEATURE_KEYS) base[k] = false
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const k of ADMIN_FEATURE_KEYS) {
      if (k in input) base[k] = Boolean((input as Record<string, unknown>)[k])
    }
  }
  return base
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getAdminFromAccessCookie(request)
  if (!actor?.user || actor.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as { permissions?: Record<string, unknown> } | null
  if (!body?.permissions) return NextResponse.json({ error: 'permissions required' }, { status: 400 })

  const load = await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}&select=id,app_role&limit=1`, {
    cache: 'no-store',
  })
  if (!load.ok) return NextResponse.json({ error: await load.text() }, { status: 500 })
  const rows = (await load.json()) as { id: string; app_role: string }[]
  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (row.app_role === 'super_admin') {
    return NextResponse.json({ error: 'cannot_change_super_admin_permissions' }, { status: 400 })
  }

  const permissions = mergePermissions(body.permissions)
  const res = await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ admin_permissions: permissions, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const updated = (await res.json()) as any[]
  return NextResponse.json({ user: updated?.[0] ?? null })
}
