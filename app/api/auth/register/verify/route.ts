import { NextResponse } from 'next/server'
import { cacheGetJson, cacheDel } from '@/lib/cache/redis'
import { supabaseSignUpEmail, supabaseSignInWithPassword, supabaseAdminCreateUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
import { assertStrongPassword } from '@/lib/validators/password-api'
import {
  parseProfilePhoneFromParts,
  profilePhoneExists,
  PROFILE_PHONE_EXISTS_MESSAGE,
} from '@/lib/auth/profile-phone'

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string; otp?: string } | null
    const email = (body?.email ?? '').trim().toLowerCase()
    const otp = (body?.otp ?? '').trim()

    if (!email || !otp) {
      return NextResponse.json({ ok: false, error: 'Missing email or verification code' }, { status: 400 })
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
      return NextResponse.json({ ok: false, error: 'Registration session expired or not found. Please start over.' }, { status: 400 })
    }

    if (record.otp !== otp) {
      return NextResponse.json({ ok: false, error: 'Invalid verification code' }, { status: 400 })
    }

    const passwordError = assertStrongPassword(record.password || '')
    if (passwordError) return passwordError

    const cookie = req.headers.get('cookie') ?? ''
    const om = cookie.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
    const otpUserId = om?.[1] ? decodeURIComponent(om[1]) : ''

    if (record.phone && record.country_code) {
      const parsed = parseProfilePhoneFromParts(
        record.phone,
        record.country || 'IN',
        record.country_code,
      )
      if (parsed.ok) {
        const exists = await profilePhoneExists(parsed.parsed, otpUserId || undefined)
        if (exists) {
          return NextResponse.json({ ok: false, error: PROFILE_PHONE_EXISTS_MESSAGE }, { status: 400 })
        }
      }
    }

    // Check if the user is already logged in with a phone-only account
    let oldProfile: any = null
    if (otpUserId) {
      oldProfile = await fetchProfileForUser(otpUserId)
    }

    let user: any = null
    let error: string | undefined = undefined

    if (oldProfile) {
      // Create user in GoTrue Auth using existing UUID via Admin API
      const adminRes = await supabaseAdminCreateUser({
        id: otpUserId,
        email: record.email,
        password: record.password || '',
        email_confirm: true,
        user_metadata: { name: record.name || oldProfile.name || '' }
      })
      user = adminRes.user
      error = adminRes.error
    } else {
      // Normal signup via GoTrue Auth SignUp API
      const signupRes = await supabaseSignUpEmail({
        email: record.email,
        password: record.password || '',
        data: { name: record.name }
      })
      user = signupRes.user
    }

    if (!user?.id) {
      throw new Error(error || 'Failed to create user in authentication service')
    }

    // Persist profile row (handles new profile creation or updating existing profile fields)
    try {
      await supabaseRest('profiles', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          id: user.id,
          email: record.email,
          name: record.name || oldProfile?.name || '',
          phone: record.phone || oldProfile?.phone || null,
          country_code: record.country_code || oldProfile?.country_code || null,
          country: record.country || oldProfile?.country || null,
          language: oldProfile?.language || null,
          currency: oldProfile?.currency || null,
          image: oldProfile?.image || null,
          is_registered_with_email: true,
          updated_at: new Date().toISOString()
        }]),
      })
    } catch (err) {
      console.error('Failed to create database profile row:', err)
    }

    // Authenticate the user to retrieve session tokens
    const { session } = await supabaseSignInWithPassword({
      email: record.email,
      password: record.password || '',
    })

    const updatedProfile = await fetchProfileForUser(user.id)
    const clientUser = buildUserFromProfile(user, updatedProfile)

    const res = NextResponse.json({
      ok: true,
      message: 'Account verified and created successfully',
      user: clientUser
    })

    if (session?.access_token) {
      res.cookies.set('sb-access-token', session.access_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 7 })
    }
    if (session?.refresh_token) {
      res.cookies.set('sb-refresh-token', session.refresh_token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 30 })
    }

    // Clear temporary OTP user cookie
    res.cookies.set('itu-user-id', '', { ...cookieOptions(), maxAge: 0 })

    // Cleanup Redis cache
    await cacheDel(cacheKey)

    return res
  } catch (e: any) {
    console.error('Verification failed:', e)
    const msg = e instanceof Error ? e.message : 'Verification failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
