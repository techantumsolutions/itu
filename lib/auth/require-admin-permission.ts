import { NextResponse } from 'next/server'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import {
  hasAdminPermission,
  hasAnyAdminPermission,
  type AdminPermissionKey,
} from '@/lib/auth/admin-permissions'

function appRoleFromUser(role: string): 'super_admin' | 'admin' | 'user' {
  const r = role.trim().toLowerCase()
  if (r === 'super_admin') return 'super_admin'
  if (r === 'admin') return 'admin'
  return 'user'
}

export function forbiddenAdminResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

async function permissionContext(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user) return null
  const ar = appRoleFromUser(ctx.user.role)
  if (ar !== 'admin' && ar !== 'super_admin') return null
  return {
    appRole: ar,
    adminPermissions: ctx.user.adminPermissions ?? null,
    user: ctx.user,
  }
}

/** Cookie-backed permission check (no legacy header bypass). */
export async function adminHasPermission(
  request: Request,
  permission: AdminPermissionKey,
): Promise<boolean> {
  const ctx = await permissionContext(request)
  if (!ctx) return false
  return hasAdminPermission({
    appRole: ctx.appRole,
    adminPermissions: ctx.adminPermissions,
    permission,
  })
}

export async function adminHasAnyPermission(
  request: Request,
  permissions: AdminPermissionKey[],
): Promise<boolean> {
  const ctx = await permissionContext(request)
  if (!ctx) return false
  return hasAnyAdminPermission(
    { appRole: ctx.appRole, adminPermissions: ctx.adminPermissions },
    permissions,
  )
}

/** Guard helper for route handlers — returns 403 response or null if allowed. */
export async function requireAdminPermission(
  request: Request,
  permission: AdminPermissionKey,
): Promise<NextResponse | null> {
  if (await adminHasPermission(request, permission)) return null
  return forbiddenAdminResponse()
}

export async function requireAnyAdminPermission(
  request: Request,
  permissions: AdminPermissionKey[],
): Promise<NextResponse | null> {
  if (await adminHasAnyPermission(request, permissions)) return null
  return forbiddenAdminResponse()
}

/** Infer write permission from HTTP method for module CRUD. */
export function writePermissionForMethod(
  modulePrefix: string,
  method: string,
): AdminPermissionKey {
  const m = method.toUpperCase()
  if (m === 'POST') return `${modulePrefix}.create` as AdminPermissionKey
  if (m === 'PUT' || m === 'PATCH') return `${modulePrefix}.edit` as AdminPermissionKey
  if (m === 'DELETE') return `${modulePrefix}.delete` as AdminPermissionKey
  return `${modulePrefix}.view` as AdminPermissionKey
}
