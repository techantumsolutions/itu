import { NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/security/otp'
import { rateLimit } from '@/lib/security/rate-limit'
import { supabaseRest } from '@/lib/db/supabase-rest'
import crypto from 'crypto'

export const runtime = 'nodejs'

function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  return fwd.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  try {
    const ip = getIp(req)
    const rl = await rateLimit({ key: `rl:v1:otp_verify:${ip}`, limit: 10, windowSeconds: 60 })
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited', resetSeconds: rl.resetSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds || 60) } },
      )
    }

    const body = (await req.json().catch(() => null)) as { phone?: string; otp?: string } | null
    const phone = (body?.phone ?? '').trim()
    const otp = (body?.otp ?? '').trim()
    if (!phone || !otp) return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })

    const result = await verifyOtp(phone, otp)
    if (!result.ok) return NextResponse.json(result, { status: 400 })

    // Persist OTP user in DB (profiles) so it works across browsers/devices.
    const userId = crypto.randomUUID()
    try {
      await supabaseRest('profiles', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([
          {
            id: userId,
            phone,
            country_code: 'IN',
            updated_at: new Date().toISOString(),
          },
        ]),
      })
    } catch {
      // ignore if profiles table not installed yet
    }

    const res = NextResponse.json({ ok: true, user: { id: userId, phone } })
    res.cookies.set('itu-user-id', userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'otp_verify_failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

