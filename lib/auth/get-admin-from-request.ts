import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { buildUserFromProfile, type ProfileRow } from '@/lib/auth/build-auth-user'

export async function fetchProfileForUser(userId: string): Promise<ProfileRow | null> {
  try {
    const res = await supabaseRest(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,name,phone,country_code,country,app_role,admin_permissions,image,is_registered_with_email,currency&limit=1`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    const rows = (await res.json()) as ProfileRow[]
    const profile = rows?.[0] ?? null
    if (profile) {
      const pointsRes = await supabaseRest(
        `reward_accounts?user_id=eq.${encodeURIComponent(userId)}&select=points_balance&limit=1`,
        { cache: 'no-store' }
      )
      if (pointsRes.ok) {
        const pointsRows = await pointsRes.json().catch(() => [])
        profile.reward_points = pointsRows[0]?.points_balance ?? 0
      } else {
        profile.reward_points = 0
      }
    }
    return profile
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
