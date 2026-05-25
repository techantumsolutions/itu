import type { User } from '@/lib/types'
import { hasAdminFeature, type AdminFeatureKey } from '@/lib/auth/admin-features'
import { normalizeAppRole } from '@/lib/auth/build-auth-user'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'

/** Effective app role (matches server `buildUserFromProfile`, including canonical admin email). */
export function clientAppRole(user: User | null): string {
  if (!user) return 'user'
  return normalizeAppRole(user.appRole ?? user.role, user.email ?? '')
}

export function clientHasAdminFeature(user: User | null, feature: AdminFeatureKey): boolean {
  if (!user || !isClientAdminUser(user)) return false
  return hasAdminFeature({
    appRole: clientAppRole(user),
    adminPermissions: user.adminPermissions ?? null,
    feature,
  })
}
