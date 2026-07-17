import { NextResponse } from 'next/server'
import { generateOtp, storeOtp } from '@/lib/security/otp'
import { shouldExposeDevOtp } from '@/lib/security/expose-dev-otp'
import { rateLimit } from '@/lib/security/rate-limit'
import { requireCaptcha } from '@/lib/security/recaptcha-guard'

export const runtime = 'nodejs'

function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  return fwd.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  try {
    const ip = getIp(req)
    const rl = await rateLimit({ key: `rl:v1:otp_send:${ip}`, limit: 5, windowSeconds: 60 })
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited', resetSeconds: rl.resetSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds || 60) } },
      )
    }

    const body = (await req.json().catch(() => null)) as { phone?: string; captchaToken?: string } | null

    const captcha = await requireCaptcha(req, body?.captchaToken, ip)
    if (!captcha.ok) {
      return captcha.response
    }

    const phone = (body?.phone ?? '').trim()
    if (!phone) return NextResponse.json({ ok: false, error: 'phone_required' }, { status: 400 })

    const otp = generateOtp()
    await storeOtp(phone, otp)

    // TODO: integrate SMS provider. Never return OTP in real production without SHOW_DEV_OTP.
    const exposeOtp = shouldExposeDevOtp()
    if (exposeOtp) {
      console.log(`\n========================================\n[DEV ONLY] SMS OTP FOR ${phone}: ${otp}\n========================================\n`)
    }
    return NextResponse.json({ ok: true, ...(exposeOtp ? { otp } : {}) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'otp_send_failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
