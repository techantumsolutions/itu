import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { cacheSetJson } from '@/lib/cache/redis'
import { runtimeEnv } from '@/lib/env/runtime'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { normalizeAppRole } from '@/lib/auth/build-auth-user'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string } | null
    const email = (body?.email ?? '').trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ ok: false, error: 'Email is required' }, { status: 400 })
    }

    // 1. Check if email exists in profiles table and has an admin/super_admin role
    let userId: string | null = null
    let hasAdminRole = false
    try {
      const checkRes = await supabaseRest(`profiles?email=eq.${encodeURIComponent(email)}&select=id,app_role&limit=1`)
      if (checkRes.ok) {
        const rows = (await checkRes.json().catch(() => [])) as { id: string; app_role?: string | null }[]
        if (rows && rows.length > 0) {
          const row = rows[0]!
          userId = row.id
          const role = normalizeAppRole(row.app_role, email)
          if (role === 'admin' || role === 'super_admin') {
            hasAdminRole = true
          }
        }
      }
    } catch (e) {
      console.error('Check staff email database error:', e)
    }

    // If the email is not registered or not an admin, return ok: true to prevent email enumeration,
    // but don't perform the actual reset token generation and emailing.
    if (!userId || !hasAdminRole) {
      return NextResponse.json({
        ok: true,
        message: 'If the email exists and belongs to a staff member, a password reset link has been sent.',
      })
    }

    // 2. Generate secure token
    const token = crypto.randomBytes(32).toString('hex')

    // 3. Store in Redis (valid for 20 minutes)
    const ttlSeconds = 20 * 60
    const cacheKey = `admin_reset_password:token:${token}`
    await cacheSetJson(cacheKey, { userId, email }, ttlSeconds)

    // 4. Build Reset URL dynamically
    const origin = req.headers.get('origin') || new URL(req.url).origin
    const resetUrl = `${origin}/admin-user/reset-password?token=${token}`

    // 5. Send email with reset URL via nodemailer
    const smtpHost = runtimeEnv('SMTP_HOST')
    const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
    const smtpUser = runtimeEnv('SMTP_USER')
    const smtpPass = runtimeEnv('SMTP_PASS')
    const isDev = process.env.NODE_ENV !== 'production'

    if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
      if (isDev) {
        console.warn(`[DEV ONLY] SMTP host is placeholder or missing. Logging staff reset link to console.`)
        console.log(`\n========================================\n[DEV ONLY] STAFF PASSWORD RESET LINK FOR ${email}:\n${resetUrl}\n========================================\n`)
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

        const currentYear = new Date().getFullYear()

        await transporter.sendMail({
          from: `"ITU Staff Services" <${smtpUser}>`,
          to: email,
          subject: 'Reset your ITU Staff password',
          text: `Please reset your staff password by visiting: ${resetUrl}. This link is valid for 20 minutes.`,
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6fa; padding: 40px 0; color: #333333; line-height: 1.6;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" max-width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
                <!-- Header -->
                <tr>
                  <td style="background-color: #0f172a; padding: 32px; text-align: center;">
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">ITU Staff Services</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 32px;">
                    <h2 style="color: #0f172a; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 16px;">Reset your password</h2>
                    <p style="color: #4a5568; font-size: 15px; margin-bottom: 24px;">We received a request to reset the password for your ITU Staff account. Click the button below to secure your account and choose a new password.</p>
                    
                    <!-- Button -->
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${resetUrl}" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 600; display: inline-block; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);">Reset Staff Password</a>
                    </div>
                    
                    <p style="color: #4a5568; font-size: 14px; margin-bottom: 16px;">This link is valid for <strong>20 minutes</strong>. If you did not request a password reset, please ignore this email; your account remains secure.</p>
                    
                    <div style="border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 24px;">
                      <p style="color: #718096; font-size: 12px; margin-top: 0;">If the button above doesn't work, copy and paste the URL below into your browser:</p>
                      <p style="color: #3182ce; font-size: 12px; word-break: break-all; margin: 8px 0 0 0;">${resetUrl}</p>
                    </div>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="color: #718096; font-size: 12px; margin: 0;">&copy; ${currentYear} ITU. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </div>
          `,
        })
      } catch (mailErr) {
        if (isDev) {
          console.warn(`[DEV ONLY] Failed to send staff email via SMTP, logging staff reset link to console fallback.`, mailErr)
          console.log(`\n========================================\n[DEV ONLY] STAFF PASSWORD RESET LINK FOR ${email}:\n${resetUrl}\n========================================\n`)
        } else {
          throw mailErr
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'If the email exists and belongs to a staff member, a password reset link has been sent.',
    })
  } catch (e) {
    console.error('Staff password reset request failed:', e)
    const msg = e instanceof Error ? e.message : 'Staff password reset request failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
