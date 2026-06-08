import { NextResponse } from 'next/server'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? ''
    const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
    let userId: string | null = null

    const token = m?.[1] ? decodeURIComponent(m[1]) : ''
    if (token) {
      const authUser = await supabaseGetUser(token)
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

    const body = (await req.json().catch(() => null)) as { email?: string; phone?: string } | null
    const email = (body?.email ?? '').trim()
    const phone = (body?.phone ?? '').trim()

    const currentProfile = await fetchProfileForUser(userId)

    // 1. Verify email uniqueness if changed
    if (email && email.toLowerCase() !== (currentProfile?.email ?? '').toLowerCase()) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      if (!emailRegex.test(email) || email.includes('..')) {
        return NextResponse.json({
          ok: false,
          error: 'Please enter a valid email address.'
        })
      }
      if (currentProfile?.app_role === 'admin') {
        return NextResponse.json({
          ok: false,
          error: 'Administrators are not allowed to change their email address.'
        })
      }
      const checkRes = await supabaseRest(
        `profiles?email=eq.${encodeURIComponent(email.toLowerCase())}&id=neq.${encodeURIComponent(userId)}&select=id&limit=1`
      )
      if (checkRes.ok) {
        const rows = (await checkRes.json().catch(() => [])) as { id: string }[]
        if (rows && rows.length > 0) {
          return NextResponse.json({
            ok: false,
            error: 'This email address is already registered to another account'
          })
        }
      }
    }

    // 2. Verify phone number uniqueness if changed
    if (phone && phone !== (currentProfile?.phone ?? '')) {
      const defaultCountry = (currentProfile?.country || 'IN') as any
      const parsed = phone.startsWith('+') ? parsePhoneNumberFromString(phone) : parsePhoneNumberFromString(phone, defaultCountry)
      let nationalNumber = phone
      let dialCode = currentProfile?.country_code || '91'
      if (parsed) {
        nationalNumber = parsed.nationalNumber as string
        dialCode = parsed.countryCallingCode as string
      }

      const checkRes = await supabaseRest(
        `profiles?and=(or(and(phone.eq.${encodeURIComponent(nationalNumber)},country_code.eq.${encodeURIComponent(dialCode)}),phone.eq.${encodeURIComponent(phone)}),id.neq.${encodeURIComponent(userId)})&select=id&limit=1`
      )
      if (checkRes.ok) {
        const rows = (await checkRes.json().catch(() => [])) as { id: string }[]
        if (rows && rows.length > 0) {
          return NextResponse.json({
            ok: false,
            error: 'This phone number is already registered to another account'
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('Check uniqueness database error:', e)
    return NextResponse.json({ ok: false, error: e.message || 'Validation failed' }, { status: 500 })
  }
}
