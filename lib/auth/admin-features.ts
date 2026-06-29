/**
 * @deprecated Import from `@/lib/auth/admin-permissions` instead.
 * Kept for gradual migration of import sites.
 */
export {
  ADMIN_PERMISSION_KEYS as ADMIN_FEATURE_KEYS,
  type AdminPermissionKey as AdminFeatureKey,
  ADMIN_PERMISSION_LABELS as ADMIN_FEATURE_LABELS,
  defaultLimitedAdminPermissions,
  normalizePermissionsJson,
  hasAdminPermission as hasAdminFeature,
  migrateLegacyPermissions,
} from '@/lib/auth/admin-permissions'
