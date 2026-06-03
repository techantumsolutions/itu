import { NextResponse } from 'next/server'
import { supabaseSignInWithPassword } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
import { cacheGetJson, cacheSetJson, cacheDel } from '@/lib/cache/redis'

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
    const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null
    const email = (body?.email ?? '').trim().toLowerCase()
    const password = body?.password ?? ''

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 })
    }

    // 1. Fetch profile to check role and is_active status
    let existingProfile: any = null
    try {
      const checkRes = await supabaseRest(`profiles?email=eq.${encodeURIComponent(email)}&select=id,app_role,is_active&limit=1`)
      if (checkRes.ok) {
        const rows = await checkRes.json().catch(() => [])
        if (rows && rows.length > 0) {
          existingProfile = rows[0]
        }
      }
    } catch (e) {
      console.error('Fetch profile login error:', e)
    }

    const isAdmin = existingProfile?.app_role === 'admin'

    // 2. Reject frozen admin accounts immediately
    if (isAdmin && existingProfile?.is_active === false) {
      return NextResponse.json(
        { ok: false, error: 'Your account has been freezed due to wrong password attempts' },
        { status: 401 }
      )
    }

    let user = null
    let session = null

    if (isAdmin) {
      // 3. Admin lockout protection: attempt sign in and track failures
      try {
        const authData = await supabaseSignInWithPassword({ email, password })
        user = authData.user
        session = authData.session

        // Clear failed attempts upon successful login
        const cacheKey = `admin_failed_attempts:${email}`
        await cacheDel(cacheKey)
      } catch (err: any) {
        const loginErrorMsg = err?.message || 'Login failed'
        const cacheKey = `admin_failed_attempts:${email}`
        let attempts = (await cacheGetJson<number>(cacheKey)) || 0
        attempts += 1
        await cacheSetJson(cacheKey, attempts, 3600) // expire after 1 hour

        if (attempts >= 5) {
          // Freeze the admin account in the profiles table
          await supabaseRest(`profiles?id=eq.${encodeURIComponent(existingProfile.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
          })
          return NextResponse.json(
            { ok: false, error: 'Your account has been freezed due to wrong password attempts' },
            { status: 401 }
          )
        }

        return NextResponse.json({ ok: false, error: loginErrorMsg }, { status: 401 })
      }
    } else {
      // 4. Default login for other roles (super_admin, user)
      const authData = await supabaseSignInWithPassword({ email, password })
      user = authData.user
      session = authData.session
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
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}

