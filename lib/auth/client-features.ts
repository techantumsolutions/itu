import type { User } from '@/lib/types'
import {
  getRequiredViewPermissionForPath,
  hasAdminPermission,
  type AdminPermissionKey,
} from '@/lib/auth/admin-permissions'
import { normalizeAppRole } from '@/lib/auth/build-auth-user'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'

/** Effective app role (matches server `buildUserFromProfile`, including canonical admin email). */
export function clientAppRole(user: User | null): string {
  if (!user) return 'user'
  return normalizeAppRole(user.appRole ?? user.role, user.email ?? '')
}

export function clientHasAdminPermission(user: User | null, permission: AdminPermissionKey): boolean {
  if (!user || !isClientAdminUser(user)) return false
  return hasAdminPermission({
    appRole: clientAppRole(user),
    adminPermissions: user.adminPermissions ?? null,
    permission,
  })
}

/** When false, admin UI shows P{n} labels instead of real provider names. */
export function clientCanShowProviderNames(user: User | null): boolean {
  if (!user || !isClientAdminUser(user)) return true
  return clientHasAdminPermission(user, 'providers.show_names')
}

/** @deprecated Use clientHasAdminPermission */
export function clientHasAdminFeature(user: User | null, feature: string): boolean {
  const viewKey = `${feature}.view` as AdminPermissionKey
  if (viewKey.includes('.') && viewKey.endsWith('.view')) {
    return clientHasAdminPermission(user, viewKey)
  }
  return clientHasAdminPermission(user, feature as AdminPermissionKey)
}

/** Maps an admin URL path to the required view permission (or super_admin for restricted areas). */
export function getRequiredFeatureForPath(pathname: string): AdminPermissionKey | 'super_admin' | null {
  return getRequiredViewPermissionForPath(pathname)
}

export { getRequiredViewPermissionForPath }
