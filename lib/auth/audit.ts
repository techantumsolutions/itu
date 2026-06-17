import { supabaseRest } from '@/lib/db/supabase-rest'
import { runtimeEnv } from '@/lib/env/runtime'
import nodemailer from 'nodemailer'
import { UAParser } from 'ua-parser-js'
import { cookies, headers } from 'next/headers'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'

export async function logLoginAudit({
  userId,
  email,
  status,
  ipAddress,
  country,
  userAgent,
}: {
  userId?: string | null
  email: string
  status: 'success' | 'failed' | 'blocked' | '2fa_required'
  ipAddress: string
  country: string
  userAgent: string
}) {
  const parser = new UAParser(userAgent)
  const result = parser.getResult()
  const deviceInfo = `${result.browser.name || 'Unknown Browser'} on ${result.os.name || 'Unknown OS'}`

  try {
    await supabaseRest('login_audit_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId || null,
        email,
        status,
        ip_address: ipAddress,
        country,
        device_info: deviceInfo,
      }),
    })
  } catch (error) {
    console.error('Failed to log login audit:', error)
  }
}

export async function sendNewAdminDeviceAlert({
  email,
  ipAddress,
  country,
  userAgent,
}: {
  email: string
  ipAddress: string
  country: string
  userAgent: string
}) {
  const parser = new UAParser(userAgent)
  const result = parser.getResult()
  const deviceInfo = `${result.browser.name || 'Unknown Browser'} on ${result.os.name || 'Unknown OS'}`

  const smtpHost = runtimeEnv('SMTP_HOST')
  const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
  const smtpUser = runtimeEnv('SMTP_USER')
  const smtpPass = runtimeEnv('SMTP_PASS')
  const isDev = process.env.NODE_ENV !== 'production'

  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>New Admin Device Login</h2>
      <p>A new device was just used to log into your admin account (${email}).</p>
      <ul>
        <li><strong>Location:</strong> ${country || 'Unknown'} (IP: ${ipAddress})</li>
        <li><strong>Browser/OS:</strong> ${deviceInfo}</li>
        <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
      </ul>
      <p>If this wasn't you, contact support immediately.</p>
    </div>
  `

  if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
    if (isDev) {
      console.warn(`[DEV ONLY] New Admin Device Alert for ${email}:\nLocation: ${country}\nBrowser: ${deviceInfo}\n`)
    }
    return
  }

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
      from: `"ITU Security" <${smtpUser}>`,
      to: email,
      subject: 'Security Alert: New Admin Device Login',
      html,
    })
  } catch (mailErr) {
    console.error('Failed to send New Admin Device alert:', mailErr)
  }
}

export async function sendLoginOtp({ email, otp }: { email: string; otp: string }) {
  const smtpHost = runtimeEnv('SMTP_HOST')
  const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
  const smtpUser = runtimeEnv('SMTP_USER')
  const smtpPass = runtimeEnv('SMTP_PASS')
  const isDev = process.env.NODE_ENV !== 'production'

  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2>Login Verification</h2>
      <p>Please use the following One-Time Password (OTP) to complete your login from a new device:</p>
      <div style="font-size: 24px; font-weight: bold; background: #f0f0f0; padding: 10px 20px; display: inline-block; border-radius: 5px; margin: 10px 0;">
        ${otp}
      </div>
      <p>This code is valid for 15 minutes.</p>
    </div>
  `

  if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
    if (isDev) {
      console.log(`\n========================================\n[DEV ONLY] LOGIN OTP FOR ${email}: ${otp}\n========================================\n`)
    }
    return
  }

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
      from: `"ITU Security" <${smtpUser}>`,
      to: email,
      subject: 'Your Login Verification Code',
      html,
    })
  } catch (mailErr) {
    if (isDev) {
      console.log(`\n========================================\n[DEV ONLY] LOGIN OTP FOR ${email}: ${otp}\n========================================\n`)
    }
    console.error('Failed to send login OTP:', mailErr)
  }
}

// Memory cache to deduplicate rapid view logs (e.g. from concurrent client page loads or strict mode)
const recentViewLogs = new Map<string, number>()
const DEDUPLICATE_WINDOW_MS = 5000 // 5 seconds

export async function logAdminActivity({
  action,
  pageName,
  details = {},
}: {
  action: string
  pageName: string
  details?: any
}) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('sb-access-token')?.value
    if (!token) return

    const u = await supabaseGetUser(token)
    if (!u?.id) return

    const profile = await fetchProfileForUser(u.id)
    if (!profile) return

    // Deduplicate rapid duplicate "View" logs
    if (action.toLowerCase().startsWith('view')) {
      const cacheKey = `${profile.id}-${action.toLowerCase()}-${pageName.toLowerCase()}`
      const now = Date.now()
      const lastLogTime = recentViewLogs.get(cacheKey)
      if (lastLogTime && now - lastLogTime < DEDUPLICATE_WINDOW_MS) {
        return
      }
      recentViewLogs.set(cacheKey, now)

      // Clean up old entries periodically to prevent memory growth
      if (recentViewLogs.size > 1000) {
        for (const [key, timestamp] of recentViewLogs.entries()) {
          if (now - timestamp > DEDUPLICATE_WINDOW_MS) {
            recentViewLogs.delete(key)
          }
        }
      }
    }

    const headerList = await headers()
    const ipAddress = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1'
    const userAgent = headerList.get('user-agent') || 'Unknown'

    await supabaseRest('admin_activity_logs', {
      method: 'POST',
      body: JSON.stringify({
        admin_id: profile.id,
        admin_email: profile.email,
        action,
        page_name: pageName,
        details,
        ip_address: ipAddress,
        user_agent: userAgent,
      }),
    })
  } catch (error) {
    console.error('Failed to log admin activity:', error)
  }
}

