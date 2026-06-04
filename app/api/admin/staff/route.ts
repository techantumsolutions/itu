import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { supabaseRest, isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import { ADMIN_FEATURE_KEYS, ADMIN_FEATURE_LABELS, type AdminFeatureKey } from '@/lib/auth/admin-features'
import { supabaseAdminCreateUser } from '@/lib/supabase/admin-users'
import { cacheSetJson } from '@/lib/cache/redis'
import { runtimeEnv } from '@/lib/env/runtime'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

function mergePermissions(input: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const base: Record<string, boolean> = {}
  for (const k of ADMIN_FEATURE_KEYS) base[k] = false
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const k of ADMIN_FEATURE_KEYS) {
      if (k in input) base[k] = Boolean((input as Record<string, unknown>)[k])
    }
  }
  return base
}

export async function GET(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const res = await supabaseRest(
    `profiles?or=(app_role.eq.admin,app_role.eq.super_admin)&select=id,email,name,app_role,admin_permissions,is_active,updated_at&order=email.asc`,
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const staff = await res.json()
  return NextResponse.json({ staff })
}

export async function POST(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string
    name?: string
    permissions?: Record<string, unknown>
  } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  const name = (body?.name ?? '').trim() || email.split('@')[0] || 'Admin'
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  // 1. Verify if email already exists in profiles
  try {
    const checkRes = await supabaseRest(`profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`)
    if (checkRes.ok) {
      const rows = (await checkRes.json().catch(() => [])) as { id: string }[]
      if (rows && rows.length > 0) {
        return NextResponse.json({ error: 'An admin or user with this email already exists' }, { status: 400 })
      }
    }
  } catch (e) {
    console.error('Check email database error:', e)
  }

  // 2. Generate a secure random password for initial registration
  const password = crypto.randomBytes(24).toString('hex')

  try {
    const created = await supabaseAdminCreateUser({ email, password, name })
    if (!created?.id) {
      return NextResponse.json({ error: 'Failed to create auth user' }, { status: 400 })
    }

    const permissions = mergePermissions(body?.permissions ?? {})
    const pr = await supabaseRest('profiles?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        {
          id: created.id,
          email: created.email,
          name,
          app_role: 'admin',
          admin_permissions: permissions,
          updated_at: new Date().toISOString(),
        },
      ]),
    })
    if (!pr.ok) return NextResponse.json({ error: await pr.text() }, { status: 500 })
    const rows = (await pr.json()) as any[]
    const adminUser = rows?.[0] ?? { id: created.id, email: created.email }

    // 3. Generate token for admin invitation setup
    const token = crypto.randomBytes(32).toString('hex')
    const ttlSeconds = 24 * 60 * 60 // 24 hours
    const cacheKey = `admin_invite:token:${token}`
    await cacheSetJson(cacheKey, { userId: created.id, email: created.email, name }, ttlSeconds)

    // 4. Send email with verification link
    const origin = request.headers.get('origin') || new URL(request.url).origin
    const inviteUrl = `${origin}/admin/setup-password?token=${token}`

    const activePermLabels = Object.entries(permissions)
      .filter(([_, v]) => v === true)
      .map(([k]) => ADMIN_FEATURE_LABELS[k as AdminFeatureKey] || k)

    const permHtml = activePermLabels.length > 0
      ? `<ul style="margin: 0; padding-left: 20px; color: #4a5568; font-size: 14px;">
          ${activePermLabels.map(label => `<li style="margin-bottom: 4px;">${label}</li>`).join('')}
         </ul>`
      : '<p style="margin: 0; color: #718096; font-size: 14px; font-style: italic;">No permissions granted yet</p>'

    const smtpHost = runtimeEnv('SMTP_HOST')
    const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
    const smtpUser = runtimeEnv('SMTP_USER')
    const smtpPass = runtimeEnv('SMTP_PASS')
    const isDev = process.env.NODE_ENV !== 'production'

    if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
      if (isDev) {
        console.warn(`[DEV ONLY] SMTP host is placeholder or missing. Logging admin invitation link to console.`)
        console.log(`\n========================================\n[DEV ONLY] ADMIN INVITATION LINK FOR ${email}:\n${inviteUrl}\n========================================\n`)
      } else {
        console.error('SMTP configuration is missing or invalid in environment')
        return NextResponse.json({ error: 'Email service configuration error' }, { status: 500 })
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
          from: `"ITU Admin Services" <${smtpUser}>`,
          to: email,
          subject: 'Set up your ITU Admin account',
          text: `You have been invited to set up your admin account. Please visit: ${inviteUrl} to set your password and access your dashboard. This link is valid for 24 hours.`,
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6fa; padding: 40px 0; color: #333333; line-height: 1.6;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" max-width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e1e8ed;">
                <!-- Header -->
                <tr>
                  <td style="background-color: #0f172a; padding: 32px; text-align: center;">
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">ITU Admin Services</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 32px;">
                    <h2 style="color: #0f172a; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 16px;">Welcome, ${name}!</h2>
                    <p style="color: #4a5568; font-size: 15px; margin-bottom: 24px;">You have been created as a limited admin user on ITU. Before you can log in, you must set up your password.</p>
                    
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
                      <h3 style="color: #0f172a; font-size: 14px; font-weight: 600; margin-top: 0; margin-bottom: 8px;">Your Account Permissions:</h3>
                      ${permHtml}
                    </div>

                    <!-- Button -->
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${inviteUrl}" style="background-color: #f15a2b; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 600; display: inline-block; box-shadow: 0 4px 12px rgba(241, 90, 43, 0.25);">Set Up Your Password</a>
                    </div>
                    
                    <p style="color: #4a5568; font-size: 14px; margin-bottom: 16px;">This setup link is valid for <strong>24 hours</strong>. If you did not expect this invitation, please ignore this email.</p>
                    
                    <div style="border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 24px;">
                      <p style="color: #718096; font-size: 12px; margin-top: 0;">If the button above doesn't work, copy and paste the URL below into your browser:</p>
                      <p style="color: #3182ce; font-size: 12px; word-break: break-all; margin: 8px 0 0 0;">${inviteUrl}</p>
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
          console.warn(`[DEV ONLY] Failed to send invitation email via SMTP, logging setup link to console fallback.`, mailErr)
          console.log(`\n========================================\n[DEV ONLY] ADMIN INVITATION LINK FOR ${email}:\n${inviteUrl}\n========================================\n`)
        } else {
          throw mailErr
        }
      }
    }

    return NextResponse.json({ user: adminUser }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create_failed' }, { status: 400 })
  }
}
