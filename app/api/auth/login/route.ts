import { NextResponse } from 'next/server'
import { supabaseSignInWithPassword } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { createAdminNotification } from '@/lib/notifications/admin-notifications'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
import { cacheGetJson, cacheSetJson, cacheDel } from '@/lib/cache/redis'
import { logLoginAudit, sendLoginOtp, sendSuperAdminLockoutAlert } from '@/lib/auth/audit'
import { generateOtp } from '@/lib/security/otp'
import { authCookieOptions } from '@/lib/auth/cookie-options'
import { getRequestIp, requireCaptcha } from '@/lib/security/recaptcha-guard'

function cookieOptions() {
  return authCookieOptions()
}

type LoginProfileRow = {
  id?: string
  app_role?: string
  is_active?: boolean
  totp_enabled?: boolean
}

function isStaffAppRole(appRole: string | null | undefined, email: string): boolean {
  const r = (appRole ?? '').trim().toLowerCase()
  return r === 'admin' || r === 'super_admin' || email === 'admin@itu.com'
}

/** Profile lookup tolerates older schemas missing optional columns (e.g. is_active). */
async function fetchLoginProfileByEmail(email: string): Promise<LoginProfileRow | null> {
  const encEmail = encodeURIComponent(email)
  const queries = [
    `profiles?email=eq.${encEmail}&select=id,app_role,is_active,totp_enabled&limit=1`,
    `profiles?email=eq.${encEmail}&select=id,app_role&limit=1`,
  ]
  for (const path of queries) {
    try {
      const res = await supabaseRest(path, { cache: 'no-store' })
      if (!res.ok) continue
      const rows = (await res.json().catch(() => [])) as LoginProfileRow[]
      if (rows?.[0]) return rows[0]
    } catch {
      /* try fallback select */
    }
  }
  return null
}

export async function POST(req: Request) {
  console.log('Login request received')
  const ipAddress = getRequestIp(req)
  const country = req.headers.get('x-vercel-ip-country') || 'Unknown'
  const userAgent = req.headers.get('user-agent') || ''
  console.log('IP address:', ipAddress)
  console.log('Country:', country)
  console.log('User agent:', userAgent)
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: string
      password?: string
      fingerprint?: string
      captchaToken?: string
      source?: string
    } | null
    const email = (body?.email ?? '').trim().toLowerCase()
    const password = body?.password ?? ''
    const fingerprint = body?.fingerprint
    const captchaToken = body?.captchaToken
    const source = body?.source
    if (!email || !password) {
      return NextResponse.json({ ok: false, success: false, error: 'Missing fields', message: 'Missing fields' }, { status: 400 })
    }

    const captcha = await requireCaptcha(req, captchaToken, ipAddress)
    if (!captcha.ok) {
      return captcha.response
    }
    if (!fingerprint && source !== 'admin') {
      return NextResponse.json(
        { ok: false, success: false, error: 'Device identification failed', message: 'Device identification failed' },
        { status: 400 },
      )
    }
    // 1. Fetch profile to check role and is_active status
    const existingProfile = await fetchLoginProfileByEmail(email)
    const isAdmin = isStaffAppRole(existingProfile?.app_role, email)
    // 2. Reject frozen admin accounts immediately
    if (isAdmin && existingProfile?.is_active === false) {
      await logLoginAudit({ userId: existingProfile?.id, email, status: 'blocked', ipAddress, country, userAgent })
      return NextResponse.json(
        { ok: false, error: 'Your account has been freezed due to wrong password attempts' },
        { status: 401 }
      )
    }
    let user = null
    let session = null
    console.log('User and session initialization passed')
    if (isAdmin) {
      // 4. Admin lockout protection: attempt sign in and track failures
      try {
        console.log('Attempting admin login')
        const authData = await supabaseSignInWithPassword({ email, password })
        console.log('Admin login successful')
        user = authData.user
        session = authData.session
        console.log('Admin login successful')
        // Clear failed attempts upon successful password
        const cacheKey = `admin_failed_attempts:${email}`
        await cacheDel(cacheKey)
      } catch (err: any) {
        const loginErrorMsg = err?.message || 'Login failed'
        await logLoginAudit({ userId: existingProfile?.id, email, status: 'failed', ipAddress, country, userAgent })
        console.log('Admin login failed, logging audit')
        const cacheKey = `admin_failed_attempts:${email}`
        let attempts = (await cacheGetJson<number>(cacheKey)) || 0
        attempts += 1
        await cacheSetJson(cacheKey, attempts, 3600) // expire after 1 hour
        console.log('Admin failed attempts cache set')
        if (attempts >= 5 && existingProfile?.id) {
          const isSuperAdminSource = existingProfile.app_role === 'super_admin' && source === 'admin'
          if (isSuperAdminSource) {
            console.log('Super admin source detected, sending email warning alert')
              // Send email warning alert instead of freezing
            await sendSuperAdminLockoutAlert({ email, ipAddress, country, userAgent })
          } else {
            console.log('Freezing admin account')
            // Freeze the admin account in the profiles table
            await supabaseRest(`profiles?id=eq.${encodeURIComponent(existingProfile.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
            })
            await createAdminNotification({
              title: 'Admin Account Frozen',
              message: `Admin account ${email} has been frozen after 5 failed password attempts.`,
              type: 'admin_account_frozen',
              details: { email, userId: existingProfile.id, ipAddress, country }
            })
            await logLoginAudit({ userId: existingProfile?.id, email, status: 'blocked', ipAddress, country, userAgent })
            console.log('Admin account frozen, logging audit')
            return NextResponse.json(
              { ok: false, error: 'Your account has been freezed due to wrong password attempts' },
              { status: 401 }
            )
          }
        }

        console.log('Admin login failed, returning error')
        return NextResponse.json({ ok: false, error: loginErrorMsg }, { status: 401 })
      }
    } else {
      console.log('Default login for normal users')
      // 5. Default login for normal users
      try {
        const authData = await supabaseSignInWithPassword({ email, password })
        user = authData.user
        console.log('User:', user)
        session = authData.session
        console.log('Session:', session)
      } catch (err: any) {
        console.log('User login failed, logging audit')
        await logLoginAudit({ userId: existingProfile?.id, email, status: 'failed', ipAddress, country, userAgent })
        console.log('User login failed, returning error')
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
    const isStaff =
      isAdmin ||
      isStaffAppRole(profile?.app_role ?? null, email) ||
      clientUser?.role === 'admin' ||
      clientUser?.role === 'super_admin'

    // 6. Global 2FA and Trusted Device check
    let is2FAEnabled = false
    try {
      const settingsRes = await supabaseRest(`app_settings?key=eq.global_2fa_settings&select=value&limit=1`)
      if (settingsRes.ok) {
        const rows = await settingsRes.json().catch(() => [])
        if (rows && rows.length > 0 && rows[0]?.value) {
          is2FAEnabled = Boolean(rows[0].value.enabled)
        }
      }
    } catch (err) {
      console.error('Fetch global 2FA setting error:', err)
    }

    let isTrusted = false
    if (isStaff && source === 'admin') {
      isTrusted = true // Super-admin sign-in at /admin/login — skip 2FA
    } else if (isAdmin) {
      if (!is2FAEnabled) {
        isTrusted = true // Skip 2FA when globally disabled for admins
      } else if (user?.id && fingerprint) {
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
    } else if (user?.id && fingerprint) {
      // Regular user flow: check trusted device
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

      let otp: string | undefined
      if (method === 'email_otp') {
        otp = generateOtp()
        await cacheSetJson(`login_otp:${tempToken}`, otp, 15 * 60)
        await sendLoginOtp({ email, otp })
      }

      await logLoginAudit({ userId: user?.id, email, status: '2fa_required', ipAddress, country, userAgent })

      const isDev = process.env.NODE_ENV !== 'production'

      return NextResponse.json({
        ok: true, // we say ok: true, but provide requires_2fa so frontend handles it
        requires_2fa: true,
        method,
        temp_token: tempToken,
        totp_enabled: is2FAEnabled, // useful for frontend if admin needs to setup TOTP
        user: clientUser,
        ...(isDev && otp ? { otp } : {}),
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

