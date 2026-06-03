import { NextResponse } from 'next/server'
import { cacheGetJson } from '@/lib/cache/redis'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { generateSecret, generateURI } from 'otplib'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      temp_token?: string
    } | null

    const tempToken = body?.temp_token
    if (!tempToken) {
      return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 })
    }

    const sessionData = await cacheGetJson<{
      user: any
      session: any
      profile: any
      fingerprint: string
    }>(`temp_2fa_session:${tempToken}`)

    if (!sessionData) {
      return NextResponse.json({ ok: false, error: 'Session expired. Please login again.' }, { status: 401 })
    }

    const { user, profile } = sessionData
    const isAdmin = profile?.app_role === 'admin' || profile?.app_role === 'super_admin'

    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'Only admins can set up TOTP' }, { status: 403 })
    }

    if (profile?.totp_enabled) {
      return NextResponse.json({ ok: false, error: 'TOTP is already enabled' }, { status: 400 })
    }

    // generate secret
    const secret = generateSecret()
    const otpauthUrl = generateURI({ secret, accountName: user?.email || 'Admin', issuer: 'ITU Admin' })

    // Save secret to database (but keep enabled = false until verified)
    try {
      await supabaseRest(`profiles?id=eq.${encodeURIComponent(user?.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ totp_secret: secret, totp_enabled: false })
      })
    } catch (e) {
      console.error('Failed to save TOTP secret:', e)
      return NextResponse.json({ ok: false, error: 'Failed to initialize TOTP' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      otpauth_url: otpauthUrl,
      secret
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Setup failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
