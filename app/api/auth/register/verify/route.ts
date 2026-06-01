import { NextResponse } from 'next/server'
import { cacheGetJson, cacheDel } from '@/lib/cache/redis'
import { supabaseSignUpEmail } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string; otp?: string } | null
    const email = (body?.email ?? '').trim().toLowerCase()
    const otp = (body?.otp ?? '').trim()

    if (!email || !otp) {
      return NextResponse.json({ ok: false, error: 'Missing email or verification code' }, { status: 400 })
    }

    const cacheKey = `pending_register:v1:${email}`
    const record = await cacheGetJson<{ email: string; password?: string; name?: string; otp: string }>(cacheKey)

    if (!record) {
      return NextResponse.json({ ok: false, error: 'Registration session expired or not found. Please start over.' }, { status: 400 })
    }

    if (record.otp !== otp) {
      return NextResponse.json({ ok: false, error: 'Invalid verification code' }, { status: 400 })
    }

    // OTP matches! Register user in Supabase.
    // If GOTRUE_MAILER_AUTOCONFIRM=true is set in the container, it will return the user and session.
    const { user } = await supabaseSignUpEmail({
      email: record.email,
      password: record.password || '',
      data: { name: record.name },
    })

    if (!user?.id) {
      throw new Error('Failed to create user in authentication service')
    }

    // Persist profile row
    try {
      await supabaseRest('profiles', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          id: user.id,
          email: record.email,
          name: record.name,
          app_role: 'user',
          updated_at: new Date().toISOString()
        }]),
      })
    } catch (err) {
      console.error('Failed to create database profile row:', err)
      // We don't abort since the auth user is created, but we log it
    }

    // Cleanup Redis cache
    await cacheDel(cacheKey)

    return NextResponse.json({
      ok: true,
      message: 'Account verified and created successfully'
    })
  } catch (e: any) {
    console.error('Verification failed:', e)
    const msg = e instanceof Error ? e.message : 'Verification failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
