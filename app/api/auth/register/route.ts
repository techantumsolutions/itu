import { NextResponse } from 'next/server'
import { supabaseSignUpEmail } from '@/lib/supabase/auth-rest'
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
    const body = (await req.json().catch(() => null)) as { email?: string; password?: string; name?: string } | null
    const email = (body?.email ?? '').trim().toLowerCase()
    const password = (body?.password ?? '').trim()
    const name = (body?.name ?? '').trim()

    if (!email || !password || !name) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 })
    }

    const { user, session } = await supabaseSignUpEmail({
      email,
      password,
      data: { name },
    })

    // Optional: persist profile row (requires profiles table)
    if (user?.id) {
      try {
        await supabaseRest('profiles', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{ id: user.id, email, name, app_role: 'user', updated_at: new Date().toISOString() }]),
        })
      } catch {
        // ignore if profiles table not installed yet
      }
    }

    const profile = user?.id ? await fetchProfileForUser(user.id) : null
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
    const msg = e instanceof Error ? e.message : 'Registration failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

