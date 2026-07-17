import { NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/security/otp'
import { rateLimit } from '@/lib/security/rate-limit'
import { supabaseRest } from '@/lib/db/supabase-rest'
import crypto from 'crypto'
import { createAdminNotification } from '@/lib/notifications/admin-notifications'
import { signOtpUserId } from '@/lib/auth/otp-session-cookie'
import { parsePhoneNumberFromString } from 'libphonenumber-js/core'
import { CountryCode } from 'libphonenumber-js'
import metadata from 'libphonenumber-js/metadata.min.json'
const actualMetadata = (metadata as any).default || metadata

export const runtime = 'nodejs'

function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  return fwd.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  try {
    const ip = getIp(req)
    const body = (await req.json().catch(() => null)) as { phone?: string; otp?: string } | null
    const phone = (body?.phone ?? '').trim()
    const otp = (body?.otp ?? '').trim()
    if (!phone || !otp) return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })

    const rl = await rateLimit({
      key: `rl:v1:otp_verify:${ip}:${phone}`,
      limit: 5,
      windowSeconds: 60,
      failClosed: true,
    })
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited', resetSeconds: rl.resetSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds || 60) } },
      )
    }

    const result = await verifyOtp(phone, otp)
    if (!result.ok) return NextResponse.json(result, { status: 400 })

    // Persist OTP user in DB (profiles) so it works across browsers/devices.
    let userId: string = crypto.randomUUID()
    const parsed = parsePhoneNumberFromString(phone, undefined, actualMetadata)
    let nationalNumber = phone.replace(/[^\d]/g, '')
    let dialCode = '91'
    let countryIso = 'IN'
    if (parsed) {
      nationalNumber = parsed.nationalNumber as string
      dialCode = parsed.countryCallingCode as string
      countryIso = parsed.country as string
    }

    try {
      // Query profiles supporting both format layouts
      const checkRes = await supabaseRest(
        `profiles?or=(and(phone.eq.${encodeURIComponent(nationalNumber)},country_code.eq.${encodeURIComponent(dialCode)}),phone.eq.${encodeURIComponent(phone)})&select=id&limit=1`
      )
      if (checkRes.ok) {
        const rows = (await checkRes.json().catch(() => [])) as { id: string }[]
        if (rows && rows.length > 0) {
          userId = rows[0]!.id
        } else {
          const displayName = `+${dialCode} ${nationalNumber}`
          await supabaseRest('profiles', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([
              {
                id: userId,
                phone: nationalNumber,
                country_code: dialCode,
                country: countryIso,
                name: displayName,
                updated_at: new Date().toISOString(),
              },
            ]),
          })
          // Trigger admin notification for guest user registration (phone OTP)
          await createAdminNotification({
            title: 'New User Registered',
            message: `User registered via mobile OTP: +${dialCode}${nationalNumber}`,
            type: 'user_registration',
            details: { phone: nationalNumber, countryCode: dialCode, userId }
          })
        }
      }
    } catch (e) {
      console.error('OTP check/insert profile database error:', e)
    }

    const res = NextResponse.json({ ok: true, user: { id: userId, phone } })
    const cookieSecure =
      process.env.NODE_ENV === 'production' &&
      process.env.COOKIE_SECURE !== 'false'
    res.cookies.set('itu-user-id', signOtpUserId(userId), {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'otp_verify_failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

