import { NextResponse } from 'next/server'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js'

export async function POST(req: Request) {
  try {
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
      // Fallback: check if we have the fallback itu-user-id cookie
      const om = cookie.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
      userId = om?.[1] ? decodeURIComponent(om[1]) : null
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as { name?: string; phone?: string } | null
    const name = (body?.name ?? '').trim()
    const phone = (body?.phone ?? '').trim()

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 })
    }

    // Resolve country context from the current profile
    const currentProfile = await fetchProfileForUser(userId)
    const isAdmin = currentProfile?.app_role === 'admin' || currentProfile?.app_role === 'super_admin'
    if (currentProfile && !currentProfile.is_registered_with_email && !isAdmin) {
      return NextResponse.json(
        { ok: false, error: 'Email & password registration is required to edit your profile.' },
        { status: 403 }
      )
    }
    const defaultCountry = (currentProfile?.country || 'IN') as any

    const parsedGlobal = phone.startsWith('+') ? parsePhoneNumberFromString(phone) : parsePhoneNumberFromString(phone, defaultCountry)
    let nationalNumber = phone
    let dialCode = currentProfile?.country_code || '91'
    let countryIso = currentProfile?.country || 'IN'

    if (parsedGlobal) {
      nationalNumber = parsedGlobal.nationalNumber as string
      dialCode = parsedGlobal.countryCallingCode as string
      countryIso = parsedGlobal.country as string
    }

    // Update the profiles table
    const updateRes = await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        phone: nationalNumber,
        country_code: dialCode,
        country: countryIso,
        updated_at: new Date().toISOString(),
      }),
    })

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '')
      console.error('Profile update database error:', errText)
      return NextResponse.json({ ok: false, error: 'Failed to update profile in database' }, { status: 500 })
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
    }

    const clientUser = authUser ? buildUserFromProfile(authUser, profile) : null

    return NextResponse.json({
      ok: true,
      user: clientUser,
    })
  } catch (e: any) {
    console.error('Profile update failed:', e)
    return NextResponse.json({ ok: false, error: e.message || 'Profile update failed' }, { status: 500 })
  }
}
