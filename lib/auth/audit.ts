import { supabaseRest } from '@/lib/db/supabase-rest'
import { runtimeEnv } from '@/lib/env/runtime'
import { shouldExposeDevOtp } from '@/lib/security/expose-dev-otp'
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

export async function sendSuperAdminLockoutAlert({
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

  const appUrl = runtimeEnv('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000'
  const adminResetUrl = `${appUrl}/admin-user/reset-password`

  const html = `
    <div style="background-color: #f8fafc; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; color: #1e293b;">
      <div style="max-w: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a8a, #0f172a); padding: 32px 24px; text-align: center;">
          <div style="display: inline-block; background-color: rgba(245, 158, 11, 0.15); border-radius: 50%; padding: 12px; margin-bottom: 16px;">
            <!-- Warning Shield Icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: auto;">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.025em; text-transform: uppercase;">Security Alert</h1>
          <p style="color: #94a3b8; font-size: 14px; margin: 8px 0 0 0;">Multiple Failed Sign-in Attempts</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px 0; color: #334155;">
            Hello Super Admin,
          </p>
          <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px 0; color: #334155;">
            This is an automated security notification. There have been <strong>5 or more consecutive failed login attempts</strong> for your account (<strong style="color: #0f172a;">${email}</strong>) from the admin portal.
          </p>
          
          <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h2 style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #b45309; margin: 0 0 12px 0; letter-spacing: 0.05em;">Attempt Details</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5;">
              <tr>
                <td style="padding: 4px 0; color: #64748b; width: 120px;"><strong>IP Address:</strong></td>
                <td style="padding: 4px 0; color: #334155; font-family: monospace;">${ipAddress}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;"><strong>Location:</strong></td>
                <td style="padding: 4px 0; color: #334155;">${country}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;"><strong>Device:</strong></td>
                <td style="padding: 4px 0; color: #334155;">${deviceInfo}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;"><strong>Time:</strong></td>
                <td style="padding: 4px 0; color: #334155;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
          </div>
          
          <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; color: #64748b;">
            Since this is a Super Admin account, <strong>account freezing has been bypassed</strong> to ensure access continuity. However, if this was not initiated by you, please change your password immediately.
          </p>
          
          <div style="text-align: center; margin: 28px 0 12px 0;">
            <a href="${adminResetUrl}" style="background-color: #1e3a8a; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">
              Reset Password
            </a>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
          <p style="margin: 0 0 8px 0;">This email was sent to ${email} regarding security settings.</p>
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} ITU Telecom. All rights reserved.</p>
        </div>
      </div>
    </div>
  `

  if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
    if (isDev) {
      console.warn(`\n========================================\n[DEV ONLY] Super Admin Lockout Alert Email to ${email}:\nDetails:\nIP: ${ipAddress}\nLocation: ${country}\nDevice: ${deviceInfo}\n========================================\n`)
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
      subject: 'Security Alert: Multiple Failed Login Attempts',
      html,
    })
  } catch (mailErr) {
    if (isDev) {
      console.warn(`\n========================================\n[DEV ONLY] Super Admin Lockout Alert Email to ${email}:\nDetails:\nIP: ${ipAddress}\nLocation: ${country}\nDevice: ${deviceInfo}\n========================================\n`)
    }
    console.error('Failed to send Super Admin lockout alert:', mailErr)
  }
}

export async function sendLoginOtp({ email, otp }: { email: string; otp: string }) {
  const smtpHost = runtimeEnv('SMTP_HOST')
  const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
  const smtpUser = runtimeEnv('SMTP_USER')
  const smtpPass = runtimeEnv('SMTP_PASS')
  const exposeOtp = shouldExposeDevOtp()

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

  if (exposeOtp) {
    console.log(`\n========================================\n[DEV ONLY] LOGIN OTP FOR ${email}: ${otp}\n========================================\n`)
  }

  if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
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
    if (exposeOtp) {
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

function getClientIpFromHeaders(headerList: Headers): string {
  // 1. Check client-real-ip cookie first
  const cookieHeader = headerList.get('cookie') || ''
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, value] = cookie.split('=').map(c => c.trim())
    if (name) acc[name] = value
    return acc
  }, {} as Record<string, string>)
  
  if (cookies['client-real-ip']) {
    const ip = cookies['client-real-ip']
    const isLoopback =
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip.toLowerCase() === 'localhost' ||
      ip === '0:0:0:0:0:0:0:1' ||
      ip.toLowerCase().includes('::ffff:127.0.0.1')
    if (!isLoopback) {
      return ip
    }
  }

  // 2. Check standard headers
  const ipHeaders = [
    'cf-connecting-ip',
    'x-client-ip',
    'x-real-ip',
    'x-forwarded-for',
    'x-vercel-forwarded-for',
    'fastly-client-ip',
    'true-client-ip',
    'x-cluster-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ]

  let fallbackIp: string | null = null

  for (const headerName of ipHeaders) {
    const value = headerList.get(headerName)
    if (!value) continue

    const parts = value.split(',').map(p => p.trim())
    for (const ip of parts) {
      if (!ip) continue
      const isLoopback =
        ip === '::1' ||
        ip === '127.0.0.1' ||
        ip.toLowerCase() === 'localhost' ||
        ip === '0:0:0:0:0:0:0:1' ||
        ip.toLowerCase().includes('::ffff:127.0.0.1')

      if (!isLoopback) {
        return ip
      } else if (!fallbackIp) {
        fallbackIp = ip
      }
    }
  }

  return fallbackIp || '127.0.0.1'
}

    const headerList = await headers()
    const ipAddress = getClientIpFromHeaders(headerList)
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

