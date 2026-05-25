import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest, isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import { ADMIN_FEATURE_KEYS } from '@/lib/auth/admin-features'
import { supabaseAdminCreateUser } from '@/lib/supabase/admin-users'

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

export async function GET(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const res = await supabaseRest(
    `profiles?or=(app_role.eq.admin,app_role.eq.super_admin)&select=id,email,name,app_role,admin_permissions,updated_at&order=email.asc`,
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const staff = await res.json()
  return NextResponse.json({ staff })
}

export async function POST(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
    name?: string
    permissions?: Record<string, unknown>
  } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  const password = (body?.password ?? '').trim()
  const name = (body?.name ?? '').trim() || email.split('@')[0] || 'Admin'
  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: 'email and password (min 8 chars) required' }, { status: 400 })
  }

  try {
    const created = await supabaseAdminCreateUser({ email, password, name })
    const permissions = mergePermissions(body?.permissions ?? {})
    const pr = await supabaseRest('profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        {
          id: created.id,
          email: created.email,
          name,
          app_role: 'admin',
          admin_permissions: permissions,
          updated_at: new Date().toISOString(),
        },
      ]),
    })
    if (!pr.ok) return NextResponse.json({ error: await pr.text() }, { status: 500 })
    const rows = (await pr.json()) as any[]
    return NextResponse.json({ user: rows?.[0] ?? { id: created.id, email: created.email } }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create_failed' }, { status: 400 })
  }
}
