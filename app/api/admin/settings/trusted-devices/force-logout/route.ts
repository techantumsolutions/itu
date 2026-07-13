import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { forceLogoutUserSessions } from '@/lib/auth/trusted-devices'
import { logAdminActivity } from '@/lib/auth/audit'

export async function POST(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = (await request.json().catch(() => null)) as { userId?: string } | null
    const userId = (body?.userId ?? '').trim()
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const profileRes = await supabaseRest(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,name,app_role&limit=1`,
      { cache: 'no-store' },
    )
    if (!profileRes.ok) {
      return NextResponse.json({ error: await profileRes.text() }, { status: 500 })
    }
    const profiles = (await profileRes.json().catch(() => [])) as {
      id: string
      email: string | null
      name: string | null
      app_role: string | null
    }[]
    const target = profiles[0]
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (target.app_role !== 'admin' && target.app_role !== 'super_admin') {
      return NextResponse.json({ error: 'Target is not an admin account' }, { status: 400 })
    }

    const result = await forceLogoutUserSessions(userId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Force logout failed' }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Force Logout Admin Sessions',
      pageName: 'Security',
      details: {
        targetUserId: target.id,
        targetEmail: target.email,
        targetName: target.name,
      },
    })

    return NextResponse.json({
      ok: true,
      message: `All sessions for ${target.email || target.name || target.id} were invalidated. Trusted devices were cleared.`,
      self: target.id === ctx.user.id,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'force_logout_failed' },
      { status: 500 },
    )
  }
}
