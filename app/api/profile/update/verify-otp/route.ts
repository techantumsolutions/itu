import { NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/security/otp'
import { rateLimit } from '@/lib/security/rate-limit'
import { supabaseGetUser, supabaseAdminUpdateUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  return fwd.split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: Request) {
  try {
    const ip = getIp(req)
    const rl = await rateLimit({ key: `rl:v1:profile_update_verify:${ip}`, limit: 10, windowSeconds: 60 })
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited', resetSeconds: rl.resetSeconds },
        { status: 429 }
      )
    }

    const cookie = req.headers.get('cookie') ?? ''
    const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
    let userId: string | null = null
    let authUser: any = null

    const token = m?.[1] ? decodeURIComponent(m[1]) : ''
    if (token) {
      authUser = await supabaseGetUser(token)
      if (authUser?.id) {
        userId = authUser.id
      }
    }

    if (!userId) {
      const om = cookie.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
      userId = om?.[1] ? decodeURIComponent(om[1]) : null
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as { type?: 'email' | 'phone'; value?: string; otp?: string } | null
    const type = body?.type
    const value = (body?.value ?? '').trim()
    const otp = (body?.otp ?? '').trim()

    if (!type || !value || !otp) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Verify OTP
    const verificationResult = await verifyOtp(value, otp)
    if (!verificationResult.ok) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired verification code' }, { status: 400 })
    }

    if (type === 'email') {
      const currentProfile = await fetchProfileForUser(userId)
      if (currentProfile?.app_role === 'admin') {
        return NextResponse.json({ ok: false, error: 'Administrators are not allowed to change their email address' }, { status: 400 })
      }
      // 1. Update user email in Supabase Auth (GoTrue)
      const adminRes = await supabaseAdminUpdateUser(userId, {
        email: value,
        email_confirm: true
      })
      if (adminRes.error) {
        throw new Error(adminRes.error)
      }

      // 2. Update email in profiles table
      const updateRes = await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: value,
          updated_at: new Date().toISOString()
        })
      })
      if (!updateRes.ok) {
        const text = await updateRes.text().catch(() => '')
        throw new Error(`Failed to update email in profiles database: ${text}`)
      }
    } else if (type === 'phone') {
      const currentProfile = await fetchProfileForUser(userId)
      const defaultCountry = (currentProfile?.country || 'IN') as any
      
      const parsedGlobal = value.startsWith('+') 
        ? parsePhoneNumberFromString(value) 
        : parsePhoneNumberFromString(value, defaultCountry)
        
      let nationalNumber = value
      let dialCode = currentProfile?.country_code || '91'
      let countryIso = currentProfile?.country || 'IN'

      if (parsedGlobal) {
        nationalNumber = parsedGlobal.nationalNumber as string
        dialCode = parsedGlobal.countryCallingCode as string
        countryIso = parsedGlobal.country as string
      }

      const updateRes = await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: nationalNumber,
          country_code: dialCode,
          country: countryIso,
          updated_at: new Date().toISOString()
        })
      })
      if (!updateRes.ok) {
        const text = await updateRes.text().catch(() => '')
        throw new Error(`Failed to update phone in profiles database: ${text}`)
      }
    }

    // Fetch the updated profile and construct client user object
    const profile = await fetchProfileForUser(userId)
    
    // Construct authUser if we didn't have it (fallback case)
    if (!authUser && profile) {
      authUser = {
        id: userId,
        email: profile.email ?? '',
        user_metadata: { name: profile.name ?? '' },
      }
    } else if (authUser && type === 'email') {
      authUser.email = value
    }

    const clientUser = authUser ? buildUserFromProfile(authUser, profile) : null

    return NextResponse.json({
      ok: true,
      user: clientUser
    })
  } catch (e: any) {
    console.error('Failed to verify OTP:', e)
    const msg = e instanceof Error ? e.message : 'OTP verification failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
