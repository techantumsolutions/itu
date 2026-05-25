import type { NextRequest } from 'next/server'

export type RequestUser = {
  id: string
  email: string
  name: string
  role: string
}

export function getRequestUser(request: NextRequest | Request): RequestUser | null {
  const id = request.headers.get('x-user-id')?.trim()
  if (!id) return null
  return {
    id,
    email: request.headers.get('x-user-email')?.trim() ?? '',
    name: request.headers.get('x-user-name')?.trim() ?? 'User',
    role: request.headers.get('x-user-role')?.trim() ?? 'user',
  }
}

export function isAdminRequest(request: NextRequest | Request): boolean {
  const role = request.headers.get('x-user-role')?.trim().toLowerCase()
  const email = request.headers.get('x-user-email')?.trim().toLowerCase()
  return role === 'admin' || role === 'super_admin' || email === 'admin@itu.com'
}

const SUPER_ADMIN_EMAIL = 'admin@itu.com'

/** Canonical super-admin account (matches profiles migration). */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === SUPER_ADMIN_EMAIL
}

export function isSuperAdminRequest(request: NextRequest | Request): boolean {
  const role = request.headers.get('x-user-role')?.trim().toLowerCase()
  if (role === 'super_admin') return true
  return isSuperAdminEmail(request.headers.get('x-user-email'))
}

/** Matches `isAdminRequest` for client-side session (admin / super_admin or canonical admin email). */
export function isClientAdminUser(user: { role: string; email?: string | null } | null | undefined): boolean {
  if (!user) return false
  const role = (user.role ?? '').trim().toLowerCase()
  if (role === 'admin' || role === 'super_admin') return true
  return isSuperAdminEmail(user.email)
}

export function isClientSuperAdmin(user: { role: string; email?: string | null } | null | undefined): boolean {
  if (!user) return false
  if ((user.role ?? '').trim().toLowerCase() === 'super_admin') return true
  return isSuperAdminEmail(user.email)
}
