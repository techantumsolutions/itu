/** Client-safe auth header helpers for browser fetch calls — no Node/Redis imports. */

export type ClientAuthUser = {
  id: string
  email?: string | null
  name?: string | null
  role?: string | null
}

/** Headers sent by the browser when auth cookies are unavailable (e.g. HTTP + Secure cookies). */
export function buildUserAuthHeaders(user: ClientAuthUser | null | undefined): Record<string, string> {
  if (!user?.id) return {}
  const headers: Record<string, string> = { 'x-user-id': user.id }
  if (user.email) headers['x-user-email'] = user.email
  if (user.name) headers['x-user-name'] = user.name
  if (user.role) headers['x-user-role'] = user.role
  return headers
}
