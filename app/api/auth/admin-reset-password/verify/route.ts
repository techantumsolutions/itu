import { NextResponse } from 'next/server'
import { cacheGetJson, cacheDel } from '@/lib/cache/redis'
import { runtimeEnv } from '@/lib/env/runtime'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { token?: string; password?: string } | null
    const token = (body?.token ?? '').trim()
    const password = (body?.password ?? '').trim()

    if (!token || !password) {
      return NextResponse.json({ ok: false, error: 'Missing token or password' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 6 characters' }, { status: 400 })
    }

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
