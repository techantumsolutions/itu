import type { User } from '@/lib/types'
import { normalizePermissionsJson } from '@/lib/auth/admin-features'

export type ProfileRow = {
  id: string
  email?: string | null
  name?: string | null
  phone?: string | null
  country_code?: string | null
  country?: string | null
  app_role?: string | null
  admin_permissions?: unknown
  image?: string | null
}

const CANONICAL_SUPER_EMAIL = 'admin@itu.com'

export function normalizeAppRole(raw: string | null | undefined, email: string): string {
  const e = email.trim().toLowerCase()
  if (e === CANONICAL_SUPER_EMAIL) return 'super_admin'
  const r = (raw ?? 'user').trim().toLowerCase()
  if (r === 'super_admin' || r === 'admin' || r === 'reseller' || r === 'user') return r
  return 'user'
}

/** Maps DB profile + auth identity into client `User` (role + permissions for admin UI). */
export function buildUserFromProfile(
  authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  profile: ProfileRow | null,
): User {
  const email = (profile?.email ?? authUser.email ?? '').trim()
  const name = (profile?.name ?? (authUser.user_metadata?.name as string) ?? '').trim() || 'User'
  const appRole = normalizeAppRole(profile?.app_role ?? null, email)
  const perms = normalizePermissionsJson(profile?.admin_permissions ?? null)

  const clientRole: User['role'] =
    appRole === 'super_admin'
      ? 'super_admin'
      : appRole === 'admin'
        ? 'admin'
        : appRole === 'reseller'
          ? 'reseller'
          : 'user'

  let displayPhone = profile?.phone ?? undefined
  if (displayPhone && profile?.country_code && !displayPhone.startsWith('+')) {
    displayPhone = `+${profile.country_code.replace('+', '')}${displayPhone}`
  }

  return {
    id: authUser.id,
    email,
    name,
    role: clientRole,
    phone: displayPhone,
    countryCode: profile?.country_code ?? undefined,
    rewardPoints: 0,
    createdAt: new Date().toISOString(),
    adminPermissions: clientRole === 'admin' ? perms : null,
    appRole,
    avatar: profile?.image ?? undefined,
  }
}
