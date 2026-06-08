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

/** Maps an admin URL path to the required feature flag (or 'super_admin' if restricted). */
export function getRequiredFeatureForPath(pathname: string): AdminFeatureKey | 'super_admin' | null {
  if (pathname.startsWith('/admin/staff')) return 'super_admin'
  if (pathname.startsWith('/admin/providers')) return 'providers'
  if (pathname.startsWith('/admin/integrations')) return 'integrations'
  if (pathname.startsWith('/admin/routing')) return 'routing'
  if (pathname.startsWith('/admin/products')) return 'products'
  if (pathname.startsWith('/admin/cms')) return 'cms'
  if (pathname.startsWith('/admin/customers')) return 'customers'
  if (pathname.startsWith('/admin/support-tickets')) return 'tickets'
  if (pathname.startsWith('/admin/ads')) return 'ads'
  if (pathname.startsWith('/admin/reconciliation')) return 'reconciliation'
  if (pathname.startsWith('/admin/reports')) return 'reports'
  if (pathname.startsWith('/admin/analytics')) return 'analytics'
  if (pathname.startsWith('/admin/statistics')) return 'statistics'
  if (pathname.startsWith('/admin/settings')) return 'settings'
  if (pathname.startsWith('/admin/help')) return 'help'
  if (pathname.startsWith('/admin/transactions')) return 'transactions'
  if (pathname.startsWith('/admin/wallet')) return 'wallet'
  if (pathname === '/admin' || pathname === '/admin/') return 'dashboard'
  
  // Return null if no specific protection matched (or if it's login/etc)
  return null
}
