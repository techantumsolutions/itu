/**
 * Server-side Google reCAPTCHA v2 token verification.
 * @see https://developers.google.com/recaptcha/docs/verify
 */

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
const DEFAULT_MAX_AGE_SECONDS = 120

export type RecaptchaVerifyOptions = {
  token: string
  remoteIp?: string
  /** Allowed hostnames from the reCAPTCHA widget (hostname field). */
  allowedHostnames?: string[]
  maxAgeSeconds?: number
  secret?: string
}

export type RecaptchaVerifyResult =
  | { ok: true; hostname?: string }
  | { ok: false; message: string; errorCodes?: string[]; hostname?: string }

type RecaptchaSiteverifyResponse = {
  success?: boolean
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
}

function readSecret(explicit?: string): string | null {
  const secret = (explicit ?? process.env.RECAPTCHA_SECRET_KEY ?? '').trim()
  return secret || null
}

/** Hostnames permitted for reCAPTCHA widget embedding. */
export function resolveAllowedRecaptchaHostnames(requestHost?: string | null): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1'])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).hostname.toLowerCase())
    } catch {
      /* ignore malformed URL */
    }
  }

  const reqHost = (requestHost ?? '').split(':')[0].trim().toLowerCase()
  if (reqHost) hosts.add(reqHost)

  return [...hosts]
}

function isHostnameAllowed(hostname: string | undefined, allowed: string[]): boolean {
  if (!hostname) return false
  const h = hostname.trim().toLowerCase()
  return allowed.some((a) => a.toLowerCase() === h)
}

function isChallengeFresh(challengeTs: string | undefined, maxAgeSeconds: number): boolean {
  if (!challengeTs) return false
  const ts = Date.parse(challengeTs)
  if (!Number.isFinite(ts)) return false
  const ageMs = Date.now() - ts
  return ageMs >= 0 && ageMs <= maxAgeSeconds * 1000
}

export async function verifyRecaptchaToken(options: RecaptchaVerifyOptions): Promise<RecaptchaVerifyResult> {
  const token = options.token?.trim()
  if (!token) {
    return { ok: false, message: 'Please verify that you are not a robot.' }
  }

  const secret = readSecret(options.secret)
  if (!secret) {
    console.error('[recaptcha] RECAPTCHA_SECRET_KEY is not configured')
    return { ok: false, message: 'CAPTCHA service is not configured.' }
  }

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (options.remoteIp?.trim()) {
    body.set('remoteip', options.remoteIp.trim())
  }

  let payload: RecaptchaSiteverifyResponse
  try {
    const res = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    payload = (await res.json().catch(() => ({}))) as RecaptchaSiteverifyResponse
    if (!res.ok) {
      console.error('[recaptcha] siteverify HTTP error', { status: res.status })
      return { ok: false, message: 'CAPTCHA verification failed. Please try again.', errorCodes: payload['error-codes'] }
    }
  } catch (err) {
    console.error('[recaptcha] siteverify network error', err instanceof Error ? err.message : 'unknown')
    return { ok: false, message: 'CAPTCHA service is temporarily unavailable. Please try again.' }
  }

  const errorCodes = payload['error-codes'] ?? []
  const hostname = payload.hostname

  if (!payload.success) {
    console.warn('[recaptcha] verification failed', {
      success: false,
      hostname,
      errorCodes,
    })
    return {
      ok: false,
      message: 'CAPTCHA verification failed. Please try again.',
      errorCodes,
      hostname,
    }
  }

  const allowedHostnames = options.allowedHostnames ?? resolveAllowedRecaptchaHostnames()
  if (!isHostnameAllowed(hostname, allowedHostnames)) {
    console.warn('[recaptcha] hostname rejected', { hostname, allowedHostnames })
    return {
      ok: false,
      message: 'CAPTCHA verification failed. Please try again.',
      errorCodes: ['hostname-mismatch'],
      hostname,
    }
  }

  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS
  if (!isChallengeFresh(payload.challenge_ts, maxAge)) {
    console.warn('[recaptcha] challenge expired', { challenge_ts: payload.challenge_ts, maxAge })
    return {
      ok: false,
      message: 'CAPTCHA expired. Please verify again.',
      errorCodes: ['challenge-expired'],
      hostname,
    }
  }

  console.info('[recaptcha] verification succeeded', { hostname })
  return { ok: true, hostname }
}
