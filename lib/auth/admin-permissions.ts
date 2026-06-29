/**
 * Module-based admin permissions (action keys).
 * Stored in profiles.admin_permissions as { "providers.view": true, ... }.
 */

export const ADMIN_PERMISSION_KEYS = [
  'dashboard.view',
  'providers.view',
  'providers.create',
  'providers.edit',
  'providers.sync',
  'providers.delete',
  'providers.show_names',
  'operators.view',
  'operators.create',
  'operators.edit',
  'operators.sync',
  'operators.delete',
  'plans.view',
  'plans.create',
  'plans.edit',
  'plans.sync',
  'plans.delete',
  'lcr.view',
  'lcr.create',
  'lcr.edit',
  'lcr.delete',
  'routing_rules.view',
  'routing_rules.create',
  'routing_rules.edit',
  'routing_rules.delete',
  'routing_logs.view',
  'wallet.view',
  'wallet.manage',
  'admin_users.view',
  'admin_users.create',
  'admin_users.edit',
  'admin_users.delete',
  'cms.view',
  'cms.create',
  'cms.edit',
  'cms.delete',
  'customers.view',
  'customers.edit',
  'tickets.view',
  'tickets.edit',
  'ads.view',
  'ads.create',
  'ads.edit',
  'ads.delete',
  'reconciliation.view',
  'reconciliation.edit',
  'transactions.view',
  'reports.view',
  'analytics.view',
  'statistics.view',
  'settings.view',
  'settings.edit',
  'help.view',
] as const

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number]

export type AdminPermissionModule =
  | 'dashboard'
  | 'providers'
  | 'operators'
  | 'plans'
  | 'lcr'
  | 'routing_rules'
  | 'routing_logs'
  | 'wallet'
  | 'admin_users'
  | 'cms'
  | 'customers'
  | 'tickets'
  | 'ads'
  | 'reconciliation'
  | 'transactions'
  | 'reports'
  | 'analytics'
  | 'statistics'
  | 'settings'
  | 'help'

export const ADMIN_PERMISSION_LABELS: Record<AdminPermissionKey, string> = {
  'dashboard.view': 'Dashboard — View',
  'providers.view': 'Providers — View',
  'providers.create': 'Providers — Create',
  'providers.edit': 'Providers — Edit',
  'providers.sync': 'Providers — Sync',
  'providers.delete': 'Providers — Delete',
  'providers.show_names': 'Providers — Show provider names (off = P1, P2 labels)',
  'operators.view': 'Operators — View',
  'operators.create': 'Operators — Create',
  'operators.edit': 'Operators — Edit',
  'operators.sync': 'Operators — Sync',
  'operators.delete': 'Operators — Delete',
  'plans.view': 'Plans — View',
  'plans.create': 'Plans — Create',
  'plans.edit': 'Plans — Edit',
  'plans.sync': 'Plans — Sync',
  'plans.delete': 'Plans — Delete',
  'lcr.view': 'LCR Engine — View',
  'lcr.create': 'LCR Engine — Create',
  'lcr.edit': 'LCR Engine — Edit',
  'lcr.delete': 'LCR Engine — Delete',
  'routing_rules.view': 'Routing Rules — View',
  'routing_rules.create': 'Routing Rules — Create',
  'routing_rules.edit': 'Routing Rules — Edit',
  'routing_rules.delete': 'Routing Rules — Delete',
  'routing_logs.view': 'Routing Logs — View',
  'wallet.view': 'Wallet — View',
  'wallet.manage': 'Wallet — Manage',
  'admin_users.view': 'Admin Users — View',
  'admin_users.create': 'Admin Users — Create',
  'admin_users.edit': 'Admin Users — Edit',
  'admin_users.delete': 'Admin Users — Delete',
  'cms.view': 'CMS — View',
  'cms.create': 'CMS — Create',
  'cms.edit': 'CMS — Edit',
  'cms.delete': 'CMS — Delete',
  'customers.view': 'Customers — View',
  'customers.edit': 'Customers — Edit',
  'tickets.view': 'Support Tickets — View',
  'tickets.edit': 'Support Tickets — Edit',
  'ads.view': 'Ads — View',
  'ads.create': 'Ads — Create',
  'ads.edit': 'Ads — Edit',
  'ads.delete': 'Ads — Delete',
  'reconciliation.view': 'Reconciliation — View',
  'reconciliation.edit': 'Reconciliation — Edit',
  'transactions.view': 'Transactions — View',
  'reports.view': 'Reports — View',
  'analytics.view': 'Analytics — View',
  'statistics.view': 'Statistics — View',
  'settings.view': 'Settings — View',
  'settings.edit': 'Settings — Edit',
  'help.view': 'Help — View',
}

/** Grouped for staff permission UI. */
export const ADMIN_PERMISSION_GROUPS: { module: string; keys: AdminPermissionKey[] }[] = [
  { module: 'Dashboard', keys: ['dashboard.view'] },
  {
    module: 'Providers',
    keys: [
      'providers.view',
      'providers.show_names',
      'providers.create',
      'providers.edit',
      'providers.sync',
      'providers.delete',
    ],
  },
  {
    module: 'Operators',
    keys: ['operators.view', 'operators.create', 'operators.edit', 'operators.sync', 'operators.delete'],
  },
  {
    module: 'Plans',
    keys: ['plans.view', 'plans.create', 'plans.edit', 'plans.sync', 'plans.delete'],
  },
  { module: 'LCR Engine', keys: ['lcr.view', 'lcr.create', 'lcr.edit', 'lcr.delete'] },
  {
    module: 'Routing Rules',
    keys: ['routing_rules.view', 'routing_rules.create', 'routing_rules.edit', 'routing_rules.delete'],
  },
  { module: 'Routing Logs', keys: ['routing_logs.view'] },
  { module: 'Wallet', keys: ['wallet.view', 'wallet.manage'] },
  {
    module: 'Admin Users',
    keys: ['admin_users.view', 'admin_users.create', 'admin_users.edit', 'admin_users.delete'],
  },
  { module: 'CMS', keys: ['cms.view', 'cms.create', 'cms.edit', 'cms.delete'] },
  { module: 'Customers', keys: ['customers.view', 'customers.edit'] },
  { module: 'Support Tickets', keys: ['tickets.view', 'tickets.edit'] },
  { module: 'Ads', keys: ['ads.view', 'ads.create', 'ads.edit', 'ads.delete'] },
  { module: 'Reconciliation', keys: ['reconciliation.view', 'reconciliation.edit'] },
  { module: 'Transactions', keys: ['transactions.view'] },
  { module: 'Reports', keys: ['reports.view'] },
  { module: 'Analytics', keys: ['analytics.view'] },
  { module: 'Statistics', keys: ['statistics.view'] },
  { module: 'Settings', keys: ['settings.view', 'settings.edit'] },
  { module: 'Help', keys: ['help.view'] },
]

const LEGACY_KEYS = new Set([
  'dashboard',
  'providers',
  'providers_manage',
  'integrations',
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
  'transactions',
  'wallet',
  'settings',
  'help',
])

function emptyPermissions(): Record<AdminPermissionKey, boolean> {
  const out = {} as Record<AdminPermissionKey, boolean>
  for (const k of ADMIN_PERMISSION_KEYS) out[k] = false
  return out
}

function isNewFormatPermissions(raw: Record<string, unknown>): boolean {
  return Object.keys(raw).some((k) => k.includes('.'))
}

function grant(out: Record<AdminPermissionKey, boolean>, ...keys: AdminPermissionKey[]) {
  for (const k of keys) out[k] = true
}

/** Map legacy single-flag permissions to action-based keys. */
export function migrateLegacyPermissions(raw: unknown): Record<AdminPermissionKey, boolean> {
  const out = emptyPermissions()
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return out

  const obj = raw as Record<string, unknown>

  if (isNewFormatPermissions(obj)) {
    for (const k of ADMIN_PERMISSION_KEYS) {
      if (k in obj) out[k] = Boolean(obj[k])
    }
    return out
  }

  const on = (key: string) => Boolean(obj[key])

  if (on('dashboard')) grant(out, 'dashboard.view')

  if (on('providers')) grant(out, 'providers.view')
  if (on('providers_manage')) {
    grant(
      out,
      'providers.create',
      'providers.edit',
      'providers.sync',
      'providers.delete',
      'providers.show_names',
    )
  }

  if (on('integrations')) {
    grant(out, 'operators.view', 'operators.create', 'operators.edit', 'operators.sync', 'operators.delete')
  }

  if (on('products')) {
    grant(out, 'plans.view', 'plans.create', 'plans.edit', 'plans.sync', 'plans.delete')
  }

  if (on('routing')) {
    grant(
      out,
      'lcr.view',
      'lcr.create',
      'lcr.edit',
      'lcr.delete',
      'routing_rules.view',
      'routing_rules.create',
      'routing_rules.edit',
      'routing_rules.delete',
      'routing_logs.view',
    )
  }

  if (on('cms')) grant(out, 'cms.view', 'cms.create', 'cms.edit', 'cms.delete')
  if (on('customers')) grant(out, 'customers.view', 'customers.edit')
  if (on('tickets')) grant(out, 'tickets.view', 'tickets.edit')
  if (on('ads')) grant(out, 'ads.view', 'ads.create', 'ads.edit', 'ads.delete')
  if (on('reconciliation')) grant(out, 'reconciliation.view', 'reconciliation.edit')
  if (on('transactions')) grant(out, 'transactions.view')
  if (on('reports')) grant(out, 'reports.view')
  if (on('analytics')) grant(out, 'analytics.view')
  if (on('statistics')) grant(out, 'statistics.view')
  if (on('wallet')) grant(out, 'wallet.view', 'wallet.manage')
  if (on('settings')) grant(out, 'settings.view', 'settings.edit')
  if (on('help')) grant(out, 'help.view')

  return out
}

/** Default ON for a new limited admin. */
export function defaultLimitedAdminPermissions(): Record<AdminPermissionKey, boolean> {
  const out = emptyPermissions()
  grant(out, 'dashboard.view', 'providers.view', 'settings.view', 'help.view')
  return out
}

/** Normalize DB JSON → action permissions (migrates legacy keys). */
export function normalizePermissionsJson(raw: unknown): Record<AdminPermissionKey, boolean> | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Object.keys(raw as object).length === 0) return null
  return migrateLegacyPermissions(raw)
}

/** Legacy admins with null permissions keep full module access (pre-migration behaviour). */
export function hasAdminPermission(params: {
  appRole: string
  adminPermissions: Record<string, boolean> | null
  permission: AdminPermissionKey
}): boolean {
  const role = (params.appRole ?? '').trim().toLowerCase()
  if (role === 'super_admin') return true
  if (role !== 'admin') return false
  if (params.adminPermissions == null) return true

  const migrated = migrateLegacyPermissions(params.adminPermissions)
  return migrated[params.permission] === true
}

export function hasAnyAdminPermission(
  params: {
    appRole: string
    adminPermissions: Record<string, boolean> | null
  },
  permissions: AdminPermissionKey[],
): boolean {
  return permissions.some((p) =>
    hasAdminPermission({ ...params, permission: p }),
  )
}

export function permissionsToStorage(
  perms: Record<AdminPermissionKey, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const k of ADMIN_PERMISSION_KEYS) {
    out[k] = Boolean(perms[k])
  }
  return out
}

export function mergePermissionsInput(
  input: Record<string, unknown> | null | undefined,
): Record<AdminPermissionKey, boolean> {
  const base = emptyPermissions()
  if (!input || typeof input !== 'object') return base
  for (const k of ADMIN_PERMISSION_KEYS) {
    if (k in input) base[k] = Boolean((input as Record<string, unknown>)[k])
  }
  return base
}

/** Route pathname → required view permission. */
export function getRequiredViewPermissionForPath(pathname: string): AdminPermissionKey | 'super_admin' | null {
  if (pathname.startsWith('/admin/staff')) return 'admin_users.view'
  if (pathname.startsWith('/admin/providers')) return 'providers.view'
  if (pathname.startsWith('/admin/integrations') || pathname.startsWith('/admin/catalog')) {
    return 'operators.view'
  }
  if (pathname.startsWith('/admin/products')) return 'plans.view'
  if (pathname.startsWith('/admin/routing/lcr-engine')) return 'lcr.view'
  if (pathname.startsWith('/admin/routing/logs')) return 'routing_logs.view'
  if (pathname.startsWith('/admin/routing')) return 'routing_rules.view'
  if (pathname.startsWith('/admin/cms')) return 'cms.view'
  if (pathname.startsWith('/admin/customers')) return 'customers.view'
  if (pathname.startsWith('/admin/support-tickets')) return 'tickets.view'
  if (pathname.startsWith('/admin/ads')) return 'ads.view'
  if (pathname.startsWith('/admin/reconciliation')) return 'reconciliation.view'
  if (pathname.startsWith('/admin/reports')) return 'reports.view'
  if (pathname.startsWith('/admin/analytics')) return 'analytics.view'
  if (pathname.startsWith('/admin/statistics')) return 'statistics.view'
  if (pathname.startsWith('/admin/transactions')) return 'transactions.view'
  if (pathname.startsWith('/admin/wallet')) return 'wallet.view'
  if (pathname.startsWith('/admin/settings')) return 'settings.view'
  if (pathname.startsWith('/admin/help')) return 'help.view'
  if (pathname === '/admin' || pathname === '/admin/') return 'dashboard.view'
  return null
}

export function isLegacyPermissionKey(key: string): boolean {
  return LEGACY_KEYS.has(key)
}
