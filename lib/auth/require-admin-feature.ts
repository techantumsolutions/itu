import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { hasAdminFeature, type AdminFeatureKey } from '@/lib/auth/admin-features'

function appRoleFromUser(role: string): 'super_admin' | 'admin' | 'user' {
  const r = role.trim().toLowerCase()
  if (r === 'super_admin') return 'super_admin'
  if (r === 'admin') return 'admin'
  return 'user'
}

/** Cookie-backed permission check; falls back to legacy header-only admin for GET-style routes. */
export async function adminCanUseFeature(request: Request, feature: AdminFeatureKey, opts?: { allowLegacyHeader?: boolean }): Promise<boolean> {
  const ctx = await getAdminFromAccessCookie(request)
  if (ctx?.user) {
    const ar = appRoleFromUser(ctx.user.role)
    if (ar !== 'admin' && ar !== 'super_admin') return false
    return hasAdminFeature({
      appRole: ar,
      adminPermissions: ctx.user.adminPermissions ?? null,
      feature,
    })
  }
  if (opts?.allowLegacyHeader && isAdminRequest(request)) return true
  return false
}

export async function adminCanUseAnyFeature(
  request: Request,
  features: AdminFeatureKey[],
  opts?: { allowLegacyHeader?: boolean },
): Promise<boolean> {
  for (const feature of features) {
    if (await adminCanUseFeature(request, feature, opts)) return true
  }
  return false
}

/** Provider mutations (sync, bootstrap, create row): cookie permissions or legacy admin header. */
export async function adminCanManageProviders(request: Request): Promise<boolean> {
  return adminCanUseFeature(request, 'providers_manage', { allowLegacyHeader: true })
}
