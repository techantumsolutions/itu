/**
 * Minimal HS256 JWT verification for Supabase access tokens.
 * Avoids a remote /auth/v1/user round-trip when SUPABASE_JWT_SECRET is set.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export type LocalJwtClaims = {
  sub: string
  exp?: number
  role?: string
  email?: string
}

function b64urlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Verify Supabase-style HS256 access token. Returns null if invalid/expired.
 */
export function verifySupabaseAccessTokenLocally(
  token: string,
  jwtSecret: string,
): LocalJwtClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  if (!headerB64 || !payloadB64 || !sigB64) return null

  let header: { alg?: string; typ?: string }
  try {
    header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8')) as { alg?: string; typ?: string }
  } catch {
    return null
  }
  if (header.alg !== 'HS256') return null

  const data = `${headerB64}.${payloadB64}`
  const expected = createHmac('sha256', jwtSecret).update(data).digest()
  const actual = b64urlToBuffer(sigB64)
  if (!safeEqual(expected, actual)) return null

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(b64urlToBuffer(payloadB64).toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : null
  if (!sub) return null

  const exp = typeof payload.exp === 'number' ? payload.exp : undefined
  if (exp != null && exp * 1000 <= Date.now()) return null

  return {
    sub,
    exp,
    role: typeof payload.role === 'string' ? payload.role : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  }
}
