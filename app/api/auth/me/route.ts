import { NextResponse } from 'next/server'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
import { isAccessTokenInvalidated } from '@/lib/auth/trusted-devices'
import { verifyOtpSessionCookie } from '@/lib/auth/otp-session-cookie'

export const dynamic = 'force-dynamic'

function clearAuthCookies(res: NextResponse) {
  res.cookies.set('sb-access-token', '', { httpOnly: true, path: '/', maxAge: 0 })
  res.cookies.set('sb-refresh-token', '', { httpOnly: true, path: '/', maxAge: 0 })
  res.cookies.set('itu-user-id', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}

export async function GET(req: Request) {
  const cookie = req.headers.get('cookie') ?? ''
  const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
  const token = m?.[1] ? decodeURIComponent(m[1]) : ''

  console.log('[auth/me] Received cookie header:', !!cookie)
  console.log('[auth/me] Extracted sb-access-token:', !!token)

  if (!token) {
    const otpUserId = verifyOtpSessionCookie(cookie) ?? ''
    console.log('[auth/me] Fallback to itu-user-id:', !!otpUserId)
    if (!otpUserId) return NextResponse.json({ ok: true, user: null })
    try {
      const profile = await fetchProfileForUser(otpUserId)
      if (!profile?.id) return NextResponse.json({ ok: true, user: null })
      const u = {
        id: profile.id,
        email: String(profile.email ?? ''),
        user_metadata: { name: String(profile.name ?? '') },
      }
      return NextResponse.json({ ok: true, user: buildUserFromProfile(u, profile) })
    } catch {
      return NextResponse.json({ ok: true, user: null })
    }
  }

  const user = await supabaseGetUser(token)
  console.log('[auth/me] supabaseGetUser result:', !!user?.id)
  if (!user?.id) return NextResponse.json({ ok: true, user: null })

  if (await isAccessTokenInvalidated(user.id, token)) {
    return clearAuthCookies(NextResponse.json({ ok: true, user: null, session_revoked: true }))
  }

  const profile = await fetchProfileForUser(user.id)
  console.log('[auth/me] fetchProfileForUser result:', !!profile, 'app_role:', profile?.app_role)
  
  const finalUser = buildUserFromProfile(user, profile)
  console.log('[auth/me] finalUser role:', finalUser.role)

  return NextResponse.json({
    ok: true,
    user: finalUser,
  })
}
