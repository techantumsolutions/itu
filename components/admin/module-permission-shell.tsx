'use client'

import type { ReactNode } from 'react'
import type { AdminPermissionModule } from '@/lib/auth/admin-permissions'
import { useAdminModulePermissions } from '@/lib/hooks/use-admin-module-permissions'
import { cn } from '@/lib/utils'

type ModulePermissionShellProps = {
  module: AdminPermissionModule
  children: ReactNode
  className?: string
}

/**
 * Wraps a module page and hides elements tagged with data-perm="create|edit|delete|sync|manage"
 * and table cells/columns tagged with data-perm-col="…" when the user lacks that permission.
 */
export function ModulePermissionShell({ module, children, className }: ModulePermissionShellProps) {
  const perms = useAdminModulePermissions(module)

  return (
    <div
      className={cn(
        'module-perms',
        perms.canCreate && 'perm-create',
        perms.canEdit && 'perm-edit',
        perms.canDelete && 'perm-delete',
        perms.canSync && 'perm-sync',
        perms.canManage && 'perm-manage',
        className,
      )}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .module-perms:not(.perm-create) [data-perm='create'] { display: none !important; }
        .module-perms:not(.perm-edit) [data-perm='edit'] { display: none !important; }
        .module-perms:not(.perm-delete) [data-perm='delete'] { display: none !important; }
        .module-perms:not(.perm-sync) [data-perm='sync'] { display: none !important; }
        .module-perms:not(.perm-manage) [data-perm='manage'] { display: none !important; }
        .module-perms:not(.perm-create) [data-perm-col='create'],
        .module-perms:not(.perm-edit) [data-perm-col='edit'],
        .module-perms:not(.perm-delete) [data-perm-col='delete'],
        .module-perms:not(.perm-sync) [data-perm-col='sync'],
        .module-perms:not(.perm-manage) [data-perm-col='manage'] { display: none !important; }
        .module-perms:not(.perm-edit) input:not([data-perm-ignore]),
        .module-perms:not(.perm-edit) textarea:not([data-perm-ignore]),
        .module-perms:not(.perm-edit) select:not([data-perm-ignore]) { pointer-events: none; }
      `,
        }}
      />
      {children}
    </div>
  )
}
