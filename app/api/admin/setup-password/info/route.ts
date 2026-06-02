import { NextResponse } from 'next/server'
import { cacheGetJson } from '@/lib/cache/redis'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = (searchParams.get('token') || '').trim()

    if (!token) {
      return NextResponse.json({ ok: false, error: 'Token is required' }, { status: 400 })
    }

    // 1. Retrieve details from Redis
    const cacheKey = `admin_invite:token:${token}`
    const record = await cacheGetJson<{ userId: string; email: string; name: string }>(cacheKey)

    if (!record || !record.userId) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired invitation link' }, { status: 400 })
    }

    const { userId, email, name } = record

    // 2. Fetch admin permissions from database profile
    let permissions: Record<string, boolean> | null = null
    const profileRes = await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}&select=admin_permissions&limit=1`)
    if (profileRes.ok) {
      const rows = (await profileRes.json().catch(() => [])) as { admin_permissions: Record<string, boolean> | null }[]
      if (rows && rows.length > 0) {
        permissions = rows[0]!.admin_permissions
      }
    }

    return NextResponse.json({
      ok: true,
      email,
      name,
      permissions,
    })
  } catch (e) {
    console.error('Failed to get invite info:', e)
    const msg = e instanceof Error ? e.message : 'Failed to retrieve setup details'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
