import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import { upsertTrustedDevice } from '@/lib/auth/trusted-devices'
import { getRequestIp } from '@/lib/security/recaptcha-guard'

/**
 * Registers / refreshes the current browser as a trusted device for the signed-in admin.
 * Needed so sessions that logged in before device tracking (or skipped 2FA) still appear as active.
 */
export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.view')
  if (denied) return denied

  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user?.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = (await request.json().catch(() => null)) as { fingerprint?: string } | null
    const fingerprint = (body?.fingerprint ?? request.headers.get('x-device-fingerprint') ?? '').trim()
    if (!fingerprint) {
      return NextResponse.json({ error: 'Device fingerprint required' }, { status: 400 })
    }

    const ipAddress = getRequestIp(request)
    const country = request.headers.get('x-vercel-ip-country') || 'Unknown'
    const userAgent = request.headers.get('user-agent') || ''

    await upsertTrustedDevice({
      userId: ctx.user.id,
      fingerprint,
      ipAddress,
      country,
      userAgent,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed_to_register_device' },
      { status: 500 },
    )
  }
}
