import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseSignInWithPassword, supabaseAdminUpdateUser } from '@/lib/supabase/auth-rest'
import { assertStrongPassword } from '@/lib/validators/password-api'

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  }
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate user from the cookies
    const ctx = await getAdminFromAccessCookie(req)
    if (!ctx || !ctx.user || !ctx.supabaseUser?.id) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { user, supabaseUser } = ctx
    const email = user.email || supabaseUser.email

    if (!email) {
      return NextResponse.json({ ok: false, error: 'User email not found' }, { status: 400 })
    }

    // Verify role is admin or super_admin
    const isAuthorized = user.role === 'admin' || user.role === 'super_admin'
    if (!isAuthorized) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    // 2. Parse request body
    const body = (await req.json().catch(() => null)) as {
      currentPassword?: string
      newPassword?: string
      confirmPassword?: string
    } | null

    const currentPassword = body?.currentPassword ?? ''
    const newPassword = body?.newPassword ?? ''
    const confirmPassword = body?.confirmPassword ?? ''

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ ok: false, error: 'Missing required password fields' }, { status: 400 })
    }

    const passwordError = assertStrongPassword(newPassword)
    if (passwordError) return passwordError

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ ok: false, error: 'Passwords do not match' }, { status: 400 })
    }

    // 3. Verify current password by signing in
    try {
      await supabaseSignInWithPassword({ email, password: currentPassword })
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: 'Incorrect current password.' },
        { status: 400 }
      )
    }

    // 4. Update password in Supabase using admin service role
    const updateRes = await supabaseAdminUpdateUser(supabaseUser.id, {
      password: newPassword,
    })

    if (updateRes.error || !updateRes.user) {
      return NextResponse.json(
        { ok: false, error: updateRes.error || 'Failed to update password' },
        { status: 500 }
      )
    }

    // 5. Sign back in with new password to refresh session token/cookies
    let newSession = null
    try {
      const signInRes = await supabaseSignInWithPassword({ email, password: newPassword })
      newSession = signInRes.session
    } catch (err: any) {
      // If sign-in fails for some reason (e.g. temporary network error), return ok: true but without setting new cookies
      console.error('Failed to log back in after password update:', err)
    }

    const res = NextResponse.json({
      ok: true,
      message: 'Password updated successfully',
    })

    // 6. Refresh cookies with new access/refresh tokens
    if (newSession?.access_token) {
      res.cookies.set('sb-access-token', newSession.access_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 7 })
    }
    if (newSession?.refresh_token) {
      res.cookies.set('sb-refresh-token', newSession.refresh_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 30 })
    }

    return res
  } catch (e: any) {
    console.error('Password update failed:', e)
    return NextResponse.json({ ok: false, error: e.message || 'Internal server error' }, { status: 500 })
  }
}
