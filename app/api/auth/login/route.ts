import { NextResponse } from 'next/server'
import { supabaseSignInWithPassword } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
import { cacheGetJson, cacheSetJson, cacheDel } from '@/lib/cache/redis'
import { logLoginAudit, sendLoginOtp } from '@/lib/auth/audit'
import { generateOtp } from '@/lib/security/otp'

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
      email?: string
      password?: string
      fingerprint?: string
      cf_turnstile_response?: string
      source?: string
    } | null
    const email = (body?.email ?? '').trim().toLowerCase()
    const password = body?.password ?? ''
    const fingerprint = body?.fingerprint
    const turnstileResponse = body?.cf_turnstile_response
    const source = body?.source

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 })
    }
    
    if (!fingerprint && source !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Device identification failed' }, { status: 400 })
    }

    // 1. Fetch profile to check role and is_active status
    let existingProfile: any = null
    try {
      const checkRes = await supabaseRest(`profiles?email=eq.${encodeURIComponent(email)}&select=id,app_role,is_active,totp_enabled&limit=1`)
      if (checkRes.ok) {
        const rows = await checkRes.json().catch(() => [])
        if (rows && rows.length > 0) {
          existingProfile = rows[0]
        }
      }
    } catch (e) {
      console.error('Fetch profile login error:', e)
    }

    const isAdmin = existingProfile?.app_role === 'admin' || existingProfile?.app_role === 'super_admin'

    // 2. Reject frozen admin accounts immediately
    if (isAdmin && existingProfile?.is_active === false) {
      await logLoginAudit({ userId: existingProfile?.id, email, status: 'blocked', ipAddress, country, userAgent })
      return NextResponse.json(
        { ok: false, error: 'Your account has been freezed due to wrong password attempts' },
        { status: 401 }
      )
    }

    // 3. Admin Turnstile verification
    if (isAdmin && source === 'admin-user') {
      const secret = process.env.TURNSTILE_SECRET_KEY
      if (secret && secret !== 'dummy_secret') {
        if (!turnstileResponse) {
          await logLoginAudit({ userId: existingProfile?.id, email, status: 'failed', ipAddress, country, userAgent })
          return NextResponse.json({ ok: false, error: 'Missing CAPTCHA response' }, { status: 400 })
        }
        try {
          const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(turnstileResponse)}`
          })
          const outcome = await turnstileRes.json()
          if (!outcome.success) {
            await logLoginAudit({ userId: existingProfile?.id, email, status: 'failed', ipAddress, country, userAgent })
            return NextResponse.json({ ok: false, error: 'CAPTCHA verification failed' }, { status: 400 })
          }
        } catch (err) {
          console.error('Turnstile verification error:', err)
          return NextResponse.json({ ok: false, error: 'CAPTCHA service error' }, { status: 500 })
        }
      }
    }

    let user = null
    let session = null

    if (isAdmin) {
      // 4. Admin lockout protection: attempt sign in and track failures
      try {
        const authData = await supabaseSignInWithPassword({ email, password })
        user = authData.user
        session = authData.session

        // Clear failed attempts upon successful password
        const cacheKey = `admin_failed_attempts:${email}`
        await cacheDel(cacheKey)
      } catch (err: any) {
        const loginErrorMsg = err?.message || 'Login failed'
        await logLoginAudit({ userId: existingProfile?.id, email, status: 'failed', ipAddress, country, userAgent })
        
        const cacheKey = `admin_failed_attempts:${email}`
        let attempts = (await cacheGetJson<number>(cacheKey)) || 0
        attempts += 1
        await cacheSetJson(cacheKey, attempts, 3600) // expire after 1 hour

        if (attempts >= 5 && existingProfile?.id) {
          // Freeze the admin account in the profiles table
          await supabaseRest(`profiles?id=eq.${encodeURIComponent(existingProfile.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
          })
          await logLoginAudit({ userId: existingProfile?.id, email, status: 'blocked', ipAddress, country, userAgent })
          return NextResponse.json(
            { ok: false, error: 'Your account has been freezed due to wrong password attempts' },
            { status: 401 }
          )
        }

        return NextResponse.json({ ok: false, error: loginErrorMsg }, { status: 401 })
      }
    } else {
      // 5. Default login for normal users
      try {
        const authData = await supabaseSignInWithPassword({ email, password })
        user = authData.user
        session = authData.session
      } catch (err: any) {
        await logLoginAudit({ userId: existingProfile?.id, email, status: 'failed', ipAddress, country, userAgent })
        return NextResponse.json({ ok: false, error: err?.message || 'Login failed' }, { status: 401 })
      }
    }

    let profile = user?.id ? await fetchProfileForUser(user.id) : null
    if (user?.id && !profile) {
      try {
        await supabaseRest('profiles?on_conflict=id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([
            {
              id: user.id,
              email,
              name: (user.user_metadata?.name as string) ?? '',
              app_role: email === 'admin@itu.com' ? 'super_admin' : 'user',
              is_active: true,
              updated_at: new Date().toISOString(),
            },
          ]),
        })
      } catch {
        /* ignore */
      }
      profile = await fetchProfileForUser(user.id)
    }

    const clientUser = user ? buildUserFromProfile(user, profile) : null

    // 6. Trusted Device check
    let isTrusted = false
    if (isAdmin && source === 'admin') {
      isTrusted = true // Skip 2FA for regular admin route
    } else if (user?.id) {
      try {
        const devRes = await supabaseRest(`trusted_devices?user_id=eq.${encodeURIComponent(user.id)}&device_fingerprint=eq.${encodeURIComponent(fingerprint)}&select=id&limit=1`)
        if (devRes.ok) {
          const devRows = await devRes.json().catch(() => [])
          isTrusted = devRows.length > 0
        }
      } catch (e) {
        console.error('Fetch trusted device error:', e)
      }
    }

    if (!isTrusted) {
      // Handle 2FA flow
      const tempToken = crypto.randomUUID()
      let method: 'totp' | 'email_otp' = 'email_otp' // Use email OTP for everyone
      
      // Save temp session to Redis (valid for 15 minutes)
      await cacheSetJson(`temp_2fa_session:${tempToken}`, {
        user: clientUser,
        session,
        profile,
        fingerprint
      }, 15 * 60)

      if (method === 'email_otp') {
        const otp = generateOtp()
        await cacheSetJson(`login_otp:${tempToken}`, otp, 15 * 60)
        await sendLoginOtp({ email, otp })
      }

      await logLoginAudit({ userId: user?.id, email, status: '2fa_required', ipAddress, country, userAgent })

      return NextResponse.json({
        ok: true, // we say ok: true, but provide requires_2fa so frontend handles it
        requires_2fa: true,
        method,
        temp_token: tempToken,
        totp_enabled: profile?.totp_enabled ?? false, // useful for frontend if admin needs to setup TOTP
        user: clientUser,
      })
    }

    // 7. Success Login logic
    // Update last_login_at
    if (user?.id && fingerprint) {
      try {
        await supabaseRest(`trusted_devices?user_id=eq.${encodeURIComponent(user.id)}&device_fingerprint=eq.${encodeURIComponent(fingerprint)}`, {
          method: 'PATCH',
          body: JSON.stringify({ last_login_at: new Date().toISOString() })
        })
      } catch (e) {
         console.error('Failed to update last_login_at', e)
      }
    }

    await logLoginAudit({ userId: user?.id, email, status: 'success', ipAddress, country, userAgent })

    const res = NextResponse.json({
      ok: true,
      user: clientUser,
    })

    if (session?.access_token) {
      res.cookies.set('sb-access-token', session.access_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 7 })
    }
    if (session?.refresh_token) {
      res.cookies.set('sb-refresh-token', session.refresh_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 30 })
    }

    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Login failed'
    await logLoginAudit({ email: 'unknown', status: 'failed', ipAddress: 'unknown', country: 'unknown', userAgent: 'unknown' })
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}

