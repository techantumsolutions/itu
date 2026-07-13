import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest, isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: 'Device id required' }, { status: 400 })
  }

  try {
    const existingRes = await supabaseRest(
      `trusted_devices?id=eq.${encodeURIComponent(id)}&select=id,user_id,device_fingerprint,last_ip,device_info&limit=1`,
      { cache: 'no-store' },
    )
    const existing = existingRes.ok
      ? ((await existingRes.json().catch(() => [])) as {
          id: string
          user_id: string
          device_fingerprint: string
          last_ip: string | null
          device_info: string | null
        }[])
      : []
    const device = existing[0]
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    const delRes = await supabaseRest(`trusted_devices?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!delRes.ok) {
      return NextResponse.json({ error: await delRes.text() }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Revoke Trusted Device',
      pageName: 'Security',
      details: {
        deviceId: device.id,
        targetUserId: device.user_id,
        fingerprint: device.device_fingerprint.slice(0, 12) + '…',
        lastIp: device.last_ip,
        deviceInfo: device.device_info,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed_to_revoke_device' },
      { status: 500 },
    )
  }
}
