import { NextResponse } from 'next/server'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'

export async function GET(req: Request) {
  const cookie = req.headers.get('cookie') ?? ''
  const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
  const token = m?.[1] ? decodeURIComponent(m[1]) : ''
  if (!token) {
    const om = cookie.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
    const otpUserId = om?.[1] ? decodeURIComponent(om[1]) : ''
    if (!otpUserId) return NextResponse.json({ ok: true, user: null })
    try {
      const res = await supabaseRest(
        `profiles?id=eq.${encodeURIComponent(otpUserId)}&select=id,email,name,phone,country_code,country,app_role,admin_permissions,image,is_registered_with_email&limit=1`,
      )
      if (!res.ok) return NextResponse.json({ ok: true, user: null })
      const rows = (await res.json()) as Array<Record<string, unknown>>
      const p = rows?.[0]
      if (!p?.id) return NextResponse.json({ ok: true, user: null })
      const u = {
        id: String(p.id),
        email: String(p.email ?? ''),
        user_metadata: { name: String(p.name ?? '') },
      }
      const profile = {
        id: String(p.id),
        email: p.email,
        name: p.name,
        phone: p.phone,
        country_code: p.country_code,
        country: p.country,
        app_role: p.app_role,
        admin_permissions: p.admin_permissions,
        image: p.image,
        is_registered_with_email: p.is_registered_with_email,
      }
      return NextResponse.json({ ok: true, user: buildUserFromProfile(u, profile as any) })
    } catch {
      return NextResponse.json({ ok: true, user: null })
    }
  }

  const user = await supabaseGetUser(token)
  if (!user?.id) return NextResponse.json({ ok: true, user: null })

  const profile = await fetchProfileForUser(user.id)
  return NextResponse.json({
    ok: true,
    user: buildUserFromProfile(user, profile),
  })
}
