/** Client-safe role helpers — no Node/server imports. */

const SUPER_ADMIN_EMAIL = 'admin@itu.com'

/** Canonical super-admin account (matches profiles migration). */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === SUPER_ADMIN_EMAIL
}

/** Matches admin / super_admin or canonical admin email from a resolved user object. */
export function isClientAdminUser(user: { role: string; email?: string | null } | null | undefined): boolean {
  if (!user) return false
  const role = (user.role ?? '').trim().toLowerCase()
  if (role === 'admin' || role === 'super_admin') return true
  return isSuperAdminEmail(user.email)
}

export function isClientSuperAdmin(user: { role: string; email?: string | null } | null | undefined): boolean {
  if (!user) return false
  if ((user.role ?? '').trim().toLowerCase() === 'super_admin') return true
  return isSuperAdminEmail(user.email)
}
