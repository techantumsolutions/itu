/** Sidebar / admin area feature flags (limited admins). */
export const ADMIN_FEATURE_KEYS = [
  'dashboard',
  'providers',
  'providers_manage',
  'routing',
  'products',
  'cms',
  'customers',
  'tickets',
  'ads',
  'reconciliation',
  'reports',
  'analytics',
  'statistics',
  'settings',
  'help',
] as const

export type AdminFeatureKey = (typeof ADMIN_FEATURE_KEYS)[number]

export const ADMIN_FEATURE_LABELS: Record<AdminFeatureKey, string> = {
  dashboard: 'Dashboard',
  providers: 'Providers (view)',
  providers_manage: 'Providers (add / sync / bootstrap)',
  routing: 'Routing',
  products: 'Products',
  cms: 'Website CMS',
  customers: 'Customers',
  tickets: 'Support tickets',
  ads: 'Ads manager',
  reconciliation: 'Reconciliation',
  reports: 'Reports & analytics',
  analytics: 'Analytics',
  statistics: 'Statistics',
  settings: 'Settings',
  help: 'Help center',
}

/** Default ON for a new limited admin (tighten as you prefer). */
export function defaultLimitedAdminPermissions(): Record<AdminFeatureKey, boolean> {
  return {
    dashboard: true,
    providers: true,
    providers_manage: false,
    routing: false,
    products: false,
    cms: false,
    customers: false,
    tickets: false,
    ads: false,
    reconciliation: false,
    reports: false,
    analytics: false,
    statistics: false,
    settings: true,
    help: true,
  }
}

export function normalizePermissionsJson(raw: unknown): Record<string, boolean> | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Object.keys(raw as object).length === 0) return null
  const out: Record<string, boolean> = {}
  for (const k of ADMIN_FEATURE_KEYS) {
    if (k in (raw as object)) out[k] = Boolean((raw as Record<string, unknown>)[k])
  }
  return out
}

export function hasAdminFeature(params: {
  appRole: string
  adminPermissions: Record<string, boolean> | null
  feature: AdminFeatureKey
}): boolean {
  const role = (params.appRole ?? '').trim().toLowerCase()
  if (role === 'super_admin') return true
  if (role !== 'admin') return false
  if (params.adminPermissions == null) return true
  return params.adminPermissions[params.feature] === true
}
