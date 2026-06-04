import { NextResponse } from 'next/server'
import { cacheGetJson, cacheDel } from '@/lib/cache/redis'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { verifySync } from 'otplib'
import { logLoginAudit, sendNewAdminDeviceAlert } from '@/lib/auth/audit'

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
  let ipAddress = req.headers.get('x-forwarded-for') || '127.0.0.1'
  if (ipAddress.includes(',')) ipAddress = ipAddress.split(',')[0].trim()
  const country = req.headers.get('x-vercel-ip-country') || 'Unknown'
  const userAgent = req.headers.get('user-agent') || ''

  try {
    const body = (await req.json().catch(() => null)) as {
      temp_token?: string
      code?: string
    } | null

    const tempToken = body?.temp_token
    const code = body?.code?.trim()

    if (!tempToken || !code) {
      return NextResponse.json({ ok: false, error: 'Missing token or code' }, { status: 400 })
    }

    // Retrieve session
    const sessionData = await cacheGetJson<{
      user: any
      session: any
      profile: any
      fingerprint: string
    }>(`temp_2fa_session:${tempToken}`)

    if (!sessionData) {
      return NextResponse.json({ ok: false, error: 'Session expired. Please login again.' }, { status: 401 })
    }

    const { user, session, profile, fingerprint } = sessionData
    const isAdmin = profile?.app_role === 'admin' || profile?.app_role === 'super_admin'

    let isValid = false

    // Validate Email OTP for all 2FA (Admin and Normal)
    const expectedOtp = await cacheGetJson<string>(`login_otp:${tempToken}`)
    if (!expectedOtp) {
      return NextResponse.json({ ok: false, error: 'OTP expired. Please login again.' }, { status: 401 })
    }
    
    if (expectedOtp === code) {
      isValid = true
      await cacheDel(`login_otp:${tempToken}`)
    }

    if (!isValid) {
      await logLoginAudit({ userId: user?.id, email: user?.email, status: 'failed', ipAddress, country, userAgent })
      return NextResponse.json({ ok: false, error: 'Invalid verification code' }, { status: 401 })
    }

    // Cleanup session from redis
    await cacheDel(`temp_2fa_session:${tempToken}`)

    // Register trusted device
    try {
      await supabaseRest('trusted_devices', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user?.id,
          device_fingerprint: fingerprint,
          last_login_at: new Date().toISOString()
        })
      })
      
      // (TOTP logic removed - we use Email OTP for everyone now)
    } catch (e) {
      console.error('Failed to register trusted device or enable totp:', e)
    }

    await logLoginAudit({ userId: user?.id, email: user?.email, status: 'success', ipAddress, country, userAgent })

    if (isAdmin) {
      await sendNewAdminDeviceAlert({ email: user?.email, ipAddress, country, userAgent })
    }

    const res = NextResponse.json({
      ok: true,
      user: sessionData.user,
    })

    console.log('[2fa/verify] sessionData.session is present:', !!session)
    console.log('[2fa/verify] session.access_token is present:', !!session?.access_token)

    if (session?.access_token) {
      console.log('[2fa/verify] Setting sb-access-token cookie')
      res.cookies.set('sb-access-token', session.access_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 7 })
    }
    if (session?.refresh_token) {
      res.cookies.set('sb-refresh-token', session.refresh_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 30 })
    }

    console.log('[2fa/verify] Returning response with cookies:', res.headers.get('set-cookie'))
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Verification failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
