import { NextResponse } from 'next/server'
import { supabaseSignInWithPassword } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'

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

    const { user, session } = await supabaseSignInWithPassword({ email, password })

    let profile = user?.id ? await fetchProfileForUser(user.id) : null
    if (user?.id && !profile) {
      try {
        await supabaseRest('profiles', {
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

