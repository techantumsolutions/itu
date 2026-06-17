import { NextResponse } from 'next/server'
import { cacheGetJson, cacheDel } from '@/lib/cache/redis'
import { runtimeEnv } from '@/lib/env/runtime'
import { logAdminActivity } from '@/lib/auth/audit'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { token?: string; password?: string } | null
    const token = (body?.token ?? '').trim()
    const password = (body?.password ?? '').trim()

    if (!token || !password) {
      return NextResponse.json({ ok: false, error: 'Missing token or password' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    // 1. Retrieve details from Redis
    const cacheKey = `admin_invite:token:${token}`
    const record = await cacheGetJson<{ userId: string; email: string }>(cacheKey)

    if (!record || !record.userId) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired invitation link' }, { status: 400 })
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
      console.error('Supabase GoTrue Admin update password error:', errText)
      return NextResponse.json(
        { ok: false, error: 'Failed to set password in authentication service' },
        { status: 500 }
      )
    }

    // 3. Clear token from Redis
    await cacheDel(cacheKey)

    await logAdminActivity({
      action: 'Complete Admin Setup Password',
      pageName: 'Security',
      details: { email: record.email },
    })

    return NextResponse.json({
      ok: true,
      message: 'Password created successfully',
    })
  } catch (e) {
    console.error('Password setup completion failed:', e)
    const msg = e instanceof Error ? e.message : 'Verification and password setup failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
