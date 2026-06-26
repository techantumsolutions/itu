import { supabaseGetUser } from '@/lib/supabase/auth-rest'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function readCookie(cookieHeader: string, name: string): string {
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return m?.[1] ? decodeURIComponent(m[1]) : ''
}

function readHeaderUserId(request: Request): string | null {
  const headerId = request.headers.get('x-user-id')?.trim() ?? ''
  if (!headerId || !UUID_RE.test(headerId)) return null
  return headerId
}

/**
 * Resolve the authenticated user id for payment/checkout APIs.
 * Order: sb-access-token cookie → itu-user-id cookie → x-user-id header.
 */
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? ''

  const token = readCookie(cookie, 'sb-access-token')
  if (token) {
    try {
      const user = await supabaseGetUser(token)
      if (user?.id) return user.id
    } catch {
      // ignore invalid/expired token
    }
  }

  const otpUserId = readCookie(cookie, 'itu-user-id')
  if (otpUserId && UUID_RE.test(otpUserId)) return otpUserId

  return readHeaderUserId(request)
}

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
