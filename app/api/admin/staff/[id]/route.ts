import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest, isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import { mergePermissionsInput, permissionsToStorage } from '@/lib/auth/admin-permissions'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { logAdminActivity } from '@/lib/auth/audit'

function mergePermissions(input: Record<string, unknown> | null | undefined): Record<string, boolean> {
  return permissionsToStorage(mergePermissionsInput(input))
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminPermission(request, 'admin_users.edit')
  if (denied) return denied

  const actor = await getAdminFromAccessCookie(request)
  if (!actor?.user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as {
    permissions?: Record<string, unknown>
    is_active?: boolean
  } | null

  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })
  if (body.permissions === undefined && body.is_active === undefined) {
    return NextResponse.json({ error: 'permissions or is_active required' }, { status: 400 })
  }

  const load = await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}&select=id,app_role&limit=1`, {
    cache: 'no-store',
  })
  if (!load.ok) return NextResponse.json({ error: await load.text() }, { status: 500 })
  const rows = (await load.json()) as { id: string; app_role: string }[]
  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (row.app_role === 'super_admin') {
    return NextResponse.json({ error: 'cannot_modify_super_admin' }, { status: 400 })
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.permissions !== undefined) {
    updatePayload.admin_permissions = mergePermissions(body.permissions)
  }
  if (body.is_active !== undefined) {
    updatePayload.is_active = body.is_active
  }

  const res = await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(updatePayload),
  })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const updated = (await res.json()) as unknown[]

  await logAdminActivity({
    action: 'Update Staff Permissions/Status',
    pageName: 'Staff',
    details: { targetId: id, update: updatePayload },
  })

  return NextResponse.json({ user: updated?.[0] ?? null })
}
