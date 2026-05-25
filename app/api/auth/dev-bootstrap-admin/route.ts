import { NextResponse } from 'next/server'
import { bootstrapSuperAdmin } from '@/lib/auth/bootstrap-super-admin'
import { runtimeEnv } from '@/lib/env/runtime'

/** Dev-only: reset super-admin password + profile. Disabled in production. */
export async function POST() {
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

  try {
    const result = await bootstrapSuperAdmin()
    return NextResponse.json({
      ok: true,
      email: result.email,
      message:
        result.passwordSource === 'env'
          ? 'Super admin updated. Sign in with ADMIN_BOOTSTRAP_PASSWORD from .env.'
          : 'Super admin updated. Sign in with email above and password 1234567890 (dev default).',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'bootstrap_failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
