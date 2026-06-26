import { runtimeEnv } from '@/lib/env/runtime'

/** Shared auth cookie options. Set COOKIE_SECURE=false on HTTP-only production hosts. */
export function authCookieOptions() {
  const secureEnv = runtimeEnv('COOKIE_SECURE')
  const secure =
    secureEnv === 'false' ? false : secureEnv === 'true' ? true : process.env.NODE_ENV === 'production'

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
  }
}
