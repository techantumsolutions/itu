import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest, isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import type { TrustedDeviceRow } from '@/lib/auth/trusted-devices'

export type TrustedDeviceListItem = TrustedDeviceRow & {
  email: string | null
  name: string | null
  app_role: string | null
  is_current: boolean
}

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.view')
  if (denied) return denied

  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const isSuperAdmin = ctx.user.role === 'super_admin'

  try {
    const staffRes = await supabaseRest(
      `profiles?or=(app_role.eq.admin,app_role.eq.super_admin)&select=id,email,name,app_role`,
      { cache: 'no-store' },
    )
    if (!staffRes.ok) {
      return NextResponse.json({ error: await staffRes.text() }, { status: 500 })
    }
    const staff = (await staffRes.json().catch(() => [])) as {
      id: string
      email: string | null
      name: string | null
      app_role: string | null
    }[]

    const staffIds = isSuperAdmin
      ? staff.map((s) => s.id)
      : staff.filter((s) => s.id === ctx.user.id).map((s) => s.id)

    if (staffIds.length === 0) {
      return NextResponse.json({ devices: [] as TrustedDeviceListItem[], canManage: isSuperAdmin })
    }

    const idFilter = staffIds.map(encodeURIComponent).join(',')
    const devicesRes = await supabaseRest(
      `trusted_devices?user_id=in.(${idFilter})&select=id,user_id,device_fingerprint,device_name,last_login_at,created_at,last_ip,last_country,device_info&order=last_login_at.desc.nullslast`,
      { cache: 'no-store' },
    )
    if (!devicesRes.ok) {
      return NextResponse.json({ error: await devicesRes.text() }, { status: 500 })
    }

    const devices = (await devicesRes.json().catch(() => [])) as TrustedDeviceRow[]
    const byId = new Map(staff.map((s) => [s.id, s]))

    // Current browser fingerprint from header (optional client hint)
    const currentFp = request.headers.get('x-device-fingerprint')?.trim() || ''

    const items: TrustedDeviceListItem[] = devices.map((d) => {
      const profile = byId.get(d.user_id)
      return {
        ...d,
        email: profile?.email ?? null,
        name: profile?.name ?? null,
        app_role: profile?.app_role ?? null,
        is_current: Boolean(currentFp && d.device_fingerprint === currentFp && d.user_id === ctx.user.id),
      }
    })

    return NextResponse.json({
      devices: items,
      canManage: isSuperAdmin,
      viewerUserId: ctx.user.id,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed_to_list_devices' },
      { status: 500 },
    )
  }
}
