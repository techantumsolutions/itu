/**
 * Typed environment validation for critical runtime secrets.
 * Uses runtimeEnv so deploy-time values are visible after next build.
 */

import { runtimeEnv } from '@/lib/env/runtime'

export type CriticalEnv = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  REDIS_URL?: string
  RAZORPAY_KEY_SECRET?: string
  RAZORPAY_KEY_ID?: string
}

export type EnvValidationResult =
  | { ok: true; env: CriticalEnv }
  | { ok: false; missing: string[] }

/** Validate required platform env. Does not throw — callers decide fail-fast policy. */
export function validateCriticalEnv(): EnvValidationResult {
  const SUPABASE_URL = runtimeEnv('SUPABASE_URL') || runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  const missing: string[] = []
  if (!SUPABASE_URL) missing.push('SUPABASE_URL')
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) return { ok: false, missing }

  return {
    ok: true,
    env: {
      SUPABASE_URL: SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY!,
      REDIS_URL: runtimeEnv('REDIS_URL'),
      RAZORPAY_KEY_SECRET: runtimeEnv('RAZORPAY_KEY_SECRET'),
      RAZORPAY_KEY_ID: runtimeEnv('RAZORPAY_KEY_ID'),
    },
  }
}

/** Throw if critical env is incomplete (boot / worker entrypoints). */
export function requireCriticalEnv(): CriticalEnv {
  const result = validateCriticalEnv()
  if (!result.ok) {
    throw new Error(`Missing required environment variables: ${result.missing.join(', ')}`)
  }
  return result.env
}
