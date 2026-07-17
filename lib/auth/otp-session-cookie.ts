import crypto from 'crypto'
import { runtimeEnv } from '@/lib/env/runtime'

/**
 * OTP / guest session cookie ("itu-user-id").
 *
 * The cookie value is HMAC-signed so it cannot be forged. A raw user id sent by
 * any HTTP client is rejected — only a value produced by `signOtpUserId` (i.e.
 * issued by our OTP verify route) is trusted. This closes the C1 auth-bypass /
 * IDOR where an unsigned user id was accepted as an identity.
 *
 * Format: `<userId>.<base64url(HMAC_SHA256(secret, userId))>`
 */

export const OTP_SESSION_COOKIE = 'itu-user-id'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Documented development-only fallback. NEVER used in production: if
// OTP_SESSION_SECRET is missing in production we fail fast (throw) instead.
const DEV_ONLY_FALLBACK_SECRET = 'dev-only-insecure-otp-session-secret'

function getSigningSecret(): string {
  const secret = runtimeEnv('OTP_SESSION_SECRET')?.trim()
  if (secret) return secret

  if (process.env.NODE_ENV === 'production') {
    // Fail fast: refuse to sign/verify OTP sessions without a dedicated secret.
    throw new Error(
      'OTP_SESSION_SECRET is required in production to sign OTP session cookies',
    )
  }

  return DEV_ONLY_FALLBACK_SECRET
}

function computeSignature(userId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(userId).digest('base64url')
}

/** Produce the signed cookie value for an authenticated OTP/guest user id. */
export function signOtpUserId(userId: string): string {
  return `${userId}.${computeSignature(userId, getSigningSecret())}`
}

/**
 * Verify a signed cookie value and return the user id, or null if the value is
 * missing, unsigned (legacy), malformed, or has an invalid signature.
 */
export function verifyOtpUserId(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null

  const secret = getSigningSecret()

  const separatorIdx = rawValue.lastIndexOf('.')
  if (separatorIdx <= 0) return null // no signature present (e.g. legacy unsigned value)

  const userId = rawValue.slice(0, separatorIdx)
  const providedSig = rawValue.slice(separatorIdx + 1)
  if (!UUID_RE.test(userId) || !providedSig) return null

  const expectedSig = computeSignature(userId, secret)
  const providedBuf = Buffer.from(providedSig)
  const expectedBuf = Buffer.from(expectedSig)
  if (providedBuf.length !== expectedBuf.length) return null
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null

  return userId
}

/** Read the OTP session cookie from a Cookie header and return the verified user id, or null. */
export function verifyOtpSessionCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
  const rawValue = match?.[1] ? decodeURIComponent(match[1]) : ''
  return verifyOtpUserId(rawValue)
}
