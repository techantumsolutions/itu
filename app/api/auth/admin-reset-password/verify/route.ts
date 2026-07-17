import { NextResponse } from 'next/server'
import { cacheGetJson, cacheDel } from '@/lib/cache/redis'
import { runtimeEnv } from '@/lib/env/runtime'
import { assertStrongPassword } from '@/lib/validators/password-api'
import { createAdminNotification } from '@/lib/notifications/admin-notifications'
import { requireCaptcha } from '@/lib/security/recaptcha-guard'
import { rateLimit } from '@/lib/security/rate-limit'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { token?: string; password?: string; captchaToken?: string } | null
    const token = (body?.token ?? '').trim()
    const password = (body?.password ?? '').trim()

    const captcha = await requireCaptcha(req, body?.captchaToken)
    if (!captcha.ok) {
      return captcha.response
    }

    if (!token || !password) {
      return NextResponse.json({ ok: false, error: 'Missing token or password' }, { status: 400 })
    }

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
    const rl = await rateLimit({
      key: `rl:v1:admin_reset_verify:${ip}:${token}`,
      limit: 10,
      windowSeconds: 60,
      failClosed: true,
    })
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.resetSeconds || 60) } },
      )
    }

    const passwordError = assertStrongPassword(password)
    if (passwordError) return passwordError

    // 1. Retrieve details from Redis using admin reset key prefix
    const cacheKey = `admin_reset_password:token:${token}`
    const record = await cacheGetJson<{ userId: string; email: string }>(cacheKey)

    if (!record || !record.userId) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired reset token' }, { status: 400 })
    }

    const { userId } = record

    // 2. Update password in Supabase Auth via Admin GoTrue endpoint
    const supabaseUrl = runtimeEnv('SUPABASE_URL')
    const serviceRoleKey = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Supabase admin configuration missing')
      return NextResponse.json({ ok: false, error: 'Database service configuration error' }, { status: 500 })
    }

    const base = supabaseUrl.replace(/\/$/, '')
    const url = `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`

    const updateRes = await fetch(url, {
      method: 'PUT',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: password,
      }),
    })

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '')
      console.error('Supabase GoTrue Admin update staff password error:', errText)
      return NextResponse.json(
        { ok: false, error: 'Failed to update password in authentication service' },
        { status: 500 }
      )
    }

    // 3. Clear token from Redis
    await cacheDel(cacheKey)

    // Trigger admin notification for admin password reset
    await createAdminNotification({
      title: 'Admin Password Updated',
      message: `Admin/staff user ${record.email} has updated their password.`,
      type: 'admin_password_set',
      details: { email: record.email, userId }
    })

    return NextResponse.json({
      ok: true,
      message: 'Password updated successfully',
    })
  } catch (e) {
    console.error('Staff password reset verification failed:', e)
    const msg = e instanceof Error ? e.message : 'Verification and password reset failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
