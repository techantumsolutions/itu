import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { generateOtp } from '@/lib/security/otp'
import { cacheSetJson } from '@/lib/cache/redis'
import { runtimeEnv } from '@/lib/env/runtime'
import { assertStrongPassword } from '@/lib/validators/password-api'
import {
  parseProfilePhoneFromParts,
  profilePhoneExists,
  PROFILE_PHONE_EXISTS_MESSAGE,
} from '@/lib/auth/profile-phone'
import nodemailer from 'nodemailer'

type PendingRegisterRecord = {
  email: string
  password?: string
  name?: string
  otp: string
  phone?: string
  country_code?: string
  country?: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: string
      password?: string
      name?: string
      phone?: string
      countryCode?: string
      dialCode?: string
    } | null
    const email = (body?.email ?? '').trim().toLowerCase()
    const password = (body?.password ?? '').trim()
    const name = (body?.name ?? '').trim()
    const phoneInput = (body?.phone ?? '').trim()
    const countryCode = (body?.countryCode ?? 'IN').trim().toUpperCase()
    const dialCode = (body?.dialCode ?? '91').trim()

    if (!email || !password || !name) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 })
    }

    const passwordError = assertStrongPassword(password)
    if (passwordError) return passwordError

    let phoneFields: Pick<PendingRegisterRecord, 'phone' | 'country_code' | 'country'> = {}
    if (phoneInput) {
      const parsedPhone = parseProfilePhoneFromParts(phoneInput, countryCode, dialCode)
      if (!parsedPhone.ok) {
        return NextResponse.json({ ok: false, error: parsedPhone.error }, { status: 400 })
      }

      try {
        const exists = await profilePhoneExists(parsedPhone.parsed)
        if (exists) {
          return NextResponse.json({ ok: false, error: PROFILE_PHONE_EXISTS_MESSAGE }, { status: 400 })
        }
      } catch (e) {
        console.error('Check phone duplicate error:', e)
      }

      phoneFields = {
        phone: parsedPhone.parsed.nationalNumber,
        country_code: parsedPhone.parsed.dialCode,
        country: parsedPhone.parsed.countryIso,
      }
    }

    // 1. Check if email already registered in profiles
    try {
      const checkRes = await supabaseRest(`profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`)
      if (checkRes.ok) {
        const rows = (await checkRes.json().catch(() => [])) as { id: string }[]
        if (rows && rows.length > 0) {
          return NextResponse.json({ ok: false, error: 'Email already registered' }, { status: 400 })
        }
      }
    } catch (e) {
      // Ignore DB errors at this check stage, let registration handle it if it occurs
      console.error('Check email duplicate error:', e)
    }

    // 2. Generate OTP
    const otp = generateOtp()

    // 3. Store user details and OTP in Redis (valid for 15 minutes)
    const ttlSeconds = 15 * 60
    const cacheKey = `pending_register:v1:${email}`
    await cacheSetJson(cacheKey, { email, password, name, otp, ...phoneFields }, ttlSeconds)

    // 4. Send email with OTP via nodemailer
    const smtpHost = runtimeEnv('SMTP_HOST')
    const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
    const smtpUser = runtimeEnv('SMTP_USER')
    const smtpPass = runtimeEnv('SMTP_PASS')
    const isDev = process.env.NODE_ENV !== 'production'

    if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
      if (isDev) {
        console.warn(`[DEV ONLY] SMTP host is placeholder or missing. Logging OTP to console.`)
        console.log(`\n========================================\n[DEV ONLY] REGISTRATION OTP FOR ${email}: ${otp}\n========================================\n`)
      } else {
        console.error('SMTP configuration is missing or invalid in environment')
        return NextResponse.json({ ok: false, error: 'Email service configuration error' }, { status: 500 })
      }
    } else {
      try {
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
          to: email,
          subject: 'Verify your ITU registration',
          text: `Your OTP is: ${otp}. It is valid for 15 minutes.`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2>Welcome to ITU!</h2>
              <p>Please use the following One-Time Password (OTP) to complete your registration:</p>
              <div style="font-size: 24px; font-weight: bold; background: #f0f0f0; padding: 10px 20px; display: inline-block; border-radius: 5px; margin: 10px 0;">
                ${otp}
              </div>
              <p>This code is valid for 15 minutes.</p>
              <p>If you did not request this code, please ignore this email.</p>
            </div>
          `,
        })
      } catch (mailErr) {
        if (isDev) {
          console.warn(`[DEV ONLY] Failed to send email via SMTP, logging OTP to console fallback.`, mailErr)
          console.log(`\n========================================\n[DEV ONLY] REGISTRATION OTP FOR ${email}: ${otp}\n========================================\n`)
        } else {
          throw mailErr
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Verification OTP sent successfully',
    })
  } catch (e) {
    console.error('Registration failed:', e)
    const msg = e instanceof Error ? e.message : 'Registration failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
