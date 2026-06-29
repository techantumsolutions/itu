'use client'

import { useMemo } from 'react'
import { useAuthStore } from '@/lib/stores'
import { clientHasAdminPermission } from '@/lib/auth/client-features'
import type { AdminPermissionKey, AdminPermissionModule } from '@/lib/auth/admin-permissions'

export type ModulePermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'sync' | 'manage'

export function useAdminModulePermissions(module: AdminPermissionModule) {
  const user = useAuthStore((s) => s.user)

  return useMemo(() => {
    const has = (action: ModulePermissionAction) =>
      !!(user && clientHasAdminPermission(user, `${module}.${action}` as AdminPermissionKey))

    const canCreate = has('create')
    const canEdit = has('edit')
    const canDelete = has('delete')
    const canSync = has('sync')
    const canManage = has('manage')

    return {
      canView: has('view'),
      canCreate,
      canEdit,
      canDelete,
      canSync,
      canManage,
      /** Any write action for this module. */
      canWrite: canCreate || canEdit || canDelete || canSync || canManage,
      readOnly: !canEdit,
    }
  }, [module, user])
}
