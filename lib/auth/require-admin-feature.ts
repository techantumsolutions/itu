/**
 * Admin permission guards for API routes.
 * Prefer `requireAdminPermission` with explicit action keys for new code.
 */
import { NextResponse } from 'next/server'
import {
  adminHasAnyPermission,
  adminHasPermission,
  forbiddenAdminResponse,
  requireAdminPermission,
  requireAnyAdminPermission,
} from '@/lib/auth/require-admin-permission'
import type { AdminPermissionKey } from '@/lib/auth/admin-permissions'

export {
  adminHasPermission,
  adminHasAnyPermission,
  forbiddenAdminResponse,
  requireAdminPermission,
  requireAnyAdminPermission,
}

type LegacyFeature =
  | 'dashboard'
  | 'providers'
  | 'integrations'
  | 'routing'
  | 'products'
  | 'cms'
  | 'customers'
  | 'tickets'
  | 'ads'
  | 'reconciliation'
  | 'reports'
  | 'analytics'
  | 'statistics'
  | 'transactions'
  | 'wallet'
  | 'settings'
  | 'help'

const LEGACY_MODULE: Record<LegacyFeature, string> = {
  dashboard: 'dashboard',
  providers: 'providers',
  integrations: 'operators',
  routing: 'routing_rules',
  products: 'plans',
  cms: 'cms',
  customers: 'customers',
  tickets: 'tickets',
  ads: 'ads',
  reconciliation: 'reconciliation',
  reports: 'reports',
  analytics: 'analytics',
  statistics: 'statistics',
  transactions: 'transactions',
  wallet: 'wallet',
  settings: 'settings',
  help: 'help',
}

/** Modules with only a view action — mutations require view permission. */
const VIEW_ONLY_MODULES = new Set(['transactions', 'routing_logs'])

/** Modules that use `.manage` instead of `.create` for writes. */
const MANAGE_MODULES = new Set(['wallet'])

function permissionFromLegacy(
  feature: string,
  method: string,
  explicit?: AdminPermissionKey,
): AdminPermissionKey {
  if (explicit) return explicit
  if (feature.includes('.')) return feature as AdminPermissionKey

  const mod = LEGACY_MODULE[feature as LegacyFeature]
  if (!mod) return 'dashboard.view'

  const m = method.toUpperCase()
  if (m === 'GET' || m === 'HEAD') return `${mod}.view` as AdminPermissionKey
  if (VIEW_ONLY_MODULES.has(mod)) return `${mod}.view` as AdminPermissionKey
  if (MANAGE_MODULES.has(mod) && (m === 'POST' || m === 'PUT' || m === 'PATCH')) {
    return `${mod}.manage` as AdminPermissionKey
  }
  if (m === 'POST') return `${mod}.create` as AdminPermissionKey
  if (m === 'PUT' || m === 'PATCH') return `${mod}.edit` as AdminPermissionKey
  if (m === 'DELETE') return `${mod}.delete` as AdminPermissionKey
  return `${mod}.view` as AdminPermissionKey
}

type FeatureCheckOptions = {
  /** Override resolved permission (use for lcr / routing_logs / etc.). */
  permission?: AdminPermissionKey
  method?: string
}

/** Resolve legacy feature name + HTTP method to an action permission. */
export async function adminCanUseFeature(
  request: Request,
  feature: string,
  opts?: FeatureCheckOptions,
): Promise<boolean> {
  const permission = permissionFromLegacy(feature, opts?.method ?? request.method, opts?.permission)
  return adminHasPermission(request, permission)
}

export async function adminCanUseAnyFeature(
  request: Request,
  features: string[],
  opts?: FeatureCheckOptions,
): Promise<boolean> {
  for (const feature of features) {
    if (await adminCanUseFeature(request, feature, opts)) return true
  }
  return false
}

/** Provider sync / bootstrap / create mutations. */
export async function adminCanManageProviders(request: Request): Promise<boolean> {
  return adminHasAnyPermission(request, [
    'providers.create',
    'providers.edit',
    'providers.sync',
    'providers.delete',
  ])
}

/** Operator sync / map / merge mutations. */
export async function adminCanManageOperators(request: Request): Promise<boolean> {
  return adminHasAnyPermission(request, [
    'operators.create',
    'operators.edit',
    'operators.sync',
    'operators.delete',
  ])
}

/** Plan sync / merge mutations. */
export async function adminCanManagePlans(request: Request): Promise<boolean> {
  return adminHasAnyPermission(request, [
    'plans.create',
    'plans.edit',
    'plans.sync',
    'plans.delete',
  ])
}

export async function guardAdminPermission(
  request: Request,
  permission: AdminPermissionKey,
): Promise<NextResponse | null> {
  return requireAdminPermission(request, permission)
}
