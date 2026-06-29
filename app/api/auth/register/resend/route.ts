import { NextResponse } from 'next/server'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'
import { generateOtp } from '@/lib/security/otp'
import { runtimeEnv } from '@/lib/env/runtime'
import nodemailer from 'nodemailer'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string } | null
    const email = (body?.email ?? '').trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ ok: false, error: 'Missing email' }, { status: 400 })
    }

    const cacheKey = `pending_register:v1:${email}`
    const record = await cacheGetJson<{
      email: string
      password?: string
      name?: string
      otp: string
      phone?: string
      country_code?: string
      country?: string
    }>(cacheKey)

    if (!record) {
      return NextResponse.json({ ok: false, error: 'Registration session expired. Please start over.' }, { status: 400 })
    }

    // Generate a new OTP
    const otp = generateOtp()

    // Update the OTP in Redis and extend TTL to 15 minutes (900 seconds)
    const ttlSeconds = 15 * 60
    await cacheSetJson(cacheKey, { ...record, otp }, ttlSeconds)

    // Send the new OTP to the user's email
    const smtpHost = runtimeEnv('SMTP_HOST')
    const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
    const smtpUser = runtimeEnv('SMTP_USER')
    const smtpPass = runtimeEnv('SMTP_PASS')
    const isDev = process.env.NODE_ENV !== 'production'

    if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
      if (isDev) {
        console.warn(`[DEV ONLY] SMTP host is placeholder or missing. Logging OTP to console.`)
        console.log(`\n========================================\n[DEV ONLY] NEW REGISTRATION OTP FOR ${email}: ${otp}\n========================================\n`)
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
          subject: 'Verify your ITU registration - New OTP',
          text: `Your new OTP is: ${otp}. It is valid for 15 minutes.`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2>ITU Email Verification</h2>
              <p>You requested a new verification code. Please use the following OTP:</p>
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
          console.log(`\n========================================\n[DEV ONLY] NEW REGISTRATION OTP FOR ${email}: ${otp}\n========================================\n`)
        } else {
          throw mailErr
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'New OTP sent successfully',
    })
  } catch (e: any) {
    console.error('Resending OTP failed:', e)
    const msg = e instanceof Error ? e.message : 'Resending OTP failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
