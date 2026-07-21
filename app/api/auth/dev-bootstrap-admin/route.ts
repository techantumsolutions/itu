import { NextResponse } from 'next/server'
import { bootstrapSuperAdmin } from '@/lib/auth/bootstrap-super-admin'
import { runtimeEnv } from '@/lib/env/runtime'

/** Dev-only: ensure super-admin exists; optional explicit password reset. Disabled in production. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'Not available' }, { status: 404 })
  }

  if (!runtimeEnv('SUPABASE_URL') || !runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    return NextResponse.json(
      { ok: false, error: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env, then restart the dev server.' },
      { status: 503 },
    )
  }
  if (!runtimeEnv('SUPABASE_ANON_KEY')) {
    return NextResponse.json(
      { ok: false, error: 'Set SUPABASE_ANON_KEY in .env (Supabase → Settings → API → anon key), then restart.' },
      { status: 503 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { resetPassword?: boolean }
  const resetPassword = body.resetPassword === true

  try {
    const result = await bootstrapSuperAdmin({ resetPassword })
    let message: string
    if (result.created) {
      message = 'Super admin created. Sign in with ADMIN_BOOTSTRAP_PASSWORD from .env.'
    } else if (result.passwordReset) {
      message = 'Super admin password reset. Sign in with ADMIN_BOOTSTRAP_PASSWORD from .env.'
    } else {
      message = 'Super admin profile ensured. Existing password was not changed.'
    }

    return NextResponse.json({
      ok: true,
      email: result.email,
      created: result.created,
      passwordReset: result.passwordReset,
      message,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'bootstrap_failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
