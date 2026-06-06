import { NextResponse } from 'next/server'
import { generateOtp, storeOtp } from '@/lib/security/otp'
import { rateLimit } from '@/lib/security/rate-limit'
import { runtimeEnv } from '@/lib/env/runtime'
import nodemailer from 'nodemailer'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  return fwd.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  try {
    const ip = getIp(req)
    const rl = await rateLimit({ key: `rl:v1:profile_update_otp:${ip}`, limit: 10, windowSeconds: 60 })
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited', resetSeconds: rl.resetSeconds },
        { status: 429 }
      )
    }

    const cookie = req.headers.get('cookie') ?? ''
    const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
    let userId: string | null = null

    const token = m?.[1] ? decodeURIComponent(m[1]) : ''
    if (token) {
      const authUser = await supabaseGetUser(token)
      if (authUser?.id) {
        userId = authUser.id
      }
    }

    if (!userId) {
      const om = cookie.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
      userId = om?.[1] ? decodeURIComponent(om[1]) : null
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as { type?: 'email' | 'phone'; value?: string } | null
    const type = body?.type
    const value = (body?.value ?? '').trim()

    if (!type || !value) {
      return NextResponse.json({ ok: false, error: 'Missing type or value' }, { status: 400 })
    }

    // Check if email or phone is already in use by another user
    if (type === 'email') {
      const currentProfile = await fetchProfileForUser(userId)
      if (currentProfile?.app_role === 'admin') {
        return NextResponse.json({ ok: false, error: 'Administrators are not allowed to change their email address' }, { status: 400 })
      }
      try {
        const checkRes = await supabaseRest(
          `profiles?email=eq.${encodeURIComponent(value.toLowerCase())}&id=neq.${encodeURIComponent(userId)}&select=id&limit=1`
        )
        if (checkRes.ok) {
          const rows = (await checkRes.json().catch(() => [])) as { id: string }[]
          if (rows && rows.length > 0) {
            return NextResponse.json({ ok: false, error: 'This email address is already registered to another account' }, { status: 400 })
          }
        }
      } catch (err) {
        console.error('Email check duplicate error:', err)
      }
    } else if (type === 'phone') {
      try {
        const currentProfile = await fetchProfileForUser(userId)
        const defaultCountry = (currentProfile?.country || 'IN') as any
        const parsed = value.startsWith('+') ? parsePhoneNumberFromString(value) : parsePhoneNumberFromString(value, defaultCountry)
        let nationalNumber = value
        let dialCode = currentProfile?.country_code || '91'
        if (parsed) {
          nationalNumber = parsed.nationalNumber as string
          dialCode = parsed.countryCallingCode as string
        }

        const checkRes = await supabaseRest(
          `profiles?and=(or(and(phone.eq.${encodeURIComponent(nationalNumber)},country_code.eq.${encodeURIComponent(dialCode)}),phone.eq.${encodeURIComponent(value)}),id.neq.${encodeURIComponent(userId)})&select=id&limit=1`
        )
        if (checkRes.ok) {
          const rows = (await checkRes.json().catch(() => [])) as { id: string }[]
          if (rows && rows.length > 0) {
            return NextResponse.json({ ok: false, error: 'This phone number is already registered to another account' }, { status: 400 })
          }
        }
      } catch (err) {
        console.error('Phone check duplicate error:', err)
      }
    }

    const otp = generateOtp()
    await storeOtp(value, otp)

    const isDev = process.env.NODE_ENV !== 'production'

    if (type === 'email') {
      const smtpHost = runtimeEnv('SMTP_HOST')
      const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
      const smtpUser = runtimeEnv('SMTP_USER')
      const smtpPass = runtimeEnv('SMTP_PASS')

      if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
        if (isDev) {
          console.warn(`[DEV ONLY] SMTP host is placeholder or missing. Logging OTP to console.`)
          console.log(`\n========================================\n[DEV ONLY] PROFILE UPDATE OTP FOR ${value}: ${otp}\n========================================\n`)
        } else {
          console.error('SMTP configuration is missing or invalid in environment')
          return NextResponse.json({ ok: false, error: 'Email service configuration error' }, { status: 500 })
        }
      } else {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        })

        await transporter.sendMail({
          from: `"ITU Support" <${smtpUser}>`,
          to: value,
          subject: 'Verify your ITU email change',
          text: `Your OTP is: ${otp}. It is valid for 5 minutes.`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2>Email Change Verification</h2>
              <p>Please use the following One-Time Password (OTP) to verify your new email address:</p>
              <div style="font-size: 24px; font-weight: bold; background: #f0f0f0; padding: 10px 20px; display: inline-block; border-radius: 5px; margin: 10px 0;">
                ${otp}
              </div>
              <p>This code is valid for 5 minutes.</p>
              <p>If you did not request this change, please ignore this email.</p>
            </div>
          `,
        })
      }
    }

    // Return OTP in response for testing if in development mode or if verifying phone
    return NextResponse.json({
      ok: true,
      message: 'Verification OTP sent successfully',
      ...(isDev || type === 'phone' ? { otp } : {})
    })
  } catch (e) {
    console.error('Failed to send verification OTP:', e)
    const msg = e instanceof Error ? e.message : 'Failed to send OTP'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
