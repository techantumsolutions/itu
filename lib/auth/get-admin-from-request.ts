import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { buildUserFromProfile, type ProfileRow } from '@/lib/auth/build-auth-user'

export async function fetchProfileForUser(userId: string): Promise<ProfileRow | null> {
  try {
    const res = await supabaseRest(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,name,phone,country_code,app_role,admin_permissions&limit=1`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    const rows = (await res.json()) as ProfileRow[]
    return rows?.[0] ?? null
  } catch {
    return null
  }
}

/** Resolve signed-in Supabase user + profile using `sb-access-token` cookie (for privileged admin APIs). */
export async function getAdminFromAccessCookie(request: Request) {
  const cookie = request.headers.get('cookie') ?? ''
  const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
  const token = m?.[1] ? decodeURIComponent(m[1]) : ''
  if (!token) return null
  const u = await supabaseGetUser(token)
  if (!u?.id) return null
  const profile = await fetchProfileForUser(u.id)
  const user = buildUserFromProfile(u, profile)
  return { token, supabaseUser: u, profile, user }
}
