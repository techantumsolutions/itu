'use client'

import type { ReactNode } from 'react'
import type { AdminPermissionModule } from '@/lib/auth/admin-permissions'
import { useAdminModulePermissions, type ModulePermissionAction } from '@/lib/hooks/use-admin-module-permissions'

type PermissionGateProps = {
  module: AdminPermissionModule
  action: ModulePermissionAction
  children: ReactNode
  fallback?: ReactNode
}

/** Renders children only when the user has the given module action permission. */
export function PermissionGate({ module, action, children, fallback = null }: PermissionGateProps) {
  const perms = useAdminModulePermissions(module)
  const allowed =
    action === 'view'
      ? perms.canView
      : action === 'create'
        ? perms.canCreate
        : action === 'edit'
          ? perms.canEdit
          : action === 'delete'
            ? perms.canDelete
            : action === 'sync'
              ? perms.canSync
              : perms.canManage

  if (!allowed) return <>{fallback}</>
  return <>{children}</>
}
