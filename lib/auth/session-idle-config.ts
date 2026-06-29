/** Inactivity timeout (minutes) from SESSION_IDLE_TIMEOUT_MINUTES; default 20. */
export const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 20

export function getSessionIdleTimeoutMinutes(): number {
  const raw = process.env.SESSION_IDLE_TIMEOUT_MINUTES?.trim()
  if (!raw) return DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES
  return Math.min(n, 24 * 60)
}

export function getSessionIdleTimeoutMs(): number {
  return getSessionIdleTimeoutMinutes() * 60 * 1000
}

export function getLoginPathForRole(role: string | null | undefined): string {
  const r = (role ?? '').trim().toLowerCase()
  if (r === 'admin') return '/admin-user/login'
  if (r === 'super_admin') return '/admin/login'
  return '/login'
}
