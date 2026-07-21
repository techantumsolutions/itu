/**
 * Auth identity caching to cut remote /auth/v1/user RTTs.
 * 1) Request-scoped (ALS) — reuse within a single request
 * 2) Short-TTL Redis — safe reuse across handlers for ~45s
 * Still checks session invalidation before returning.
 */

import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'
import { supabaseGetUser, type SupabaseUser } from '@/lib/supabase/auth-rest'
import { isAccessTokenInvalidated } from '@/lib/auth/trusted-devices'
import { runtimeEnv } from '@/lib/env/runtime'
import { verifySupabaseAccessTokenLocally } from '@/lib/auth/verify-jwt-local'

const AUTH_CACHE_TTL_SEC = 45
const AUTH_CACHE_PREFIX = 'auth:session:v1:'

type AuthStore = {
  byTokenHash: Map<string, string | null>
}

const requestAuth = new AsyncLocalStorage<AuthStore>()

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function cacheKey(hash: string): string {
  return `${AUTH_CACHE_PREFIX}${hash}`
}

export function runWithRequestAuthStore<T>(fn: () => T): T {
  return requestAuth.run({ byTokenHash: new Map() }, fn)
}

export async function runWithRequestAuthStoreAsync<T>(fn: () => Promise<T>): Promise<T> {
  return requestAuth.run({ byTokenHash: new Map() }, fn)
}

/**
 * Resolve Supabase user id from access token with layered caches.
 * Security: always re-check invalidation; never trust cache alone for revoked sessions.
 */
export async function resolveUserIdFromAccessToken(token: string): Promise<string | null> {
  const hash = tokenHash(token)
  const store = requestAuth.getStore()
  if (store?.byTokenHash.has(hash)) {
    return store.byTokenHash.get(hash) ?? null
  }

  const cached = await cacheGetJson<{ userId: string }>(cacheKey(hash))
  if (cached?.userId) {
    if (await isAccessTokenInvalidated(cached.userId, token)) {
      store?.byTokenHash.set(hash, null)
      return null
    }
    store?.byTokenHash.set(hash, cached.userId)
    return cached.userId
  }

  // Local JWT verify when SUPABASE_JWT_SECRET is configured (no network).
  const jwtSecret = runtimeEnv('SUPABASE_JWT_SECRET')
  if (jwtSecret) {
    const local = verifySupabaseAccessTokenLocally(token, jwtSecret)
    if (local?.sub) {
      if (await isAccessTokenInvalidated(local.sub, token)) {
        store?.byTokenHash.set(hash, null)
        return null
      }
      store?.byTokenHash.set(hash, local.sub)
      void cacheSetJson(cacheKey(hash), { userId: local.sub }, AUTH_CACHE_TTL_SEC)
      return local.sub
    }
  }

  let user: SupabaseUser | null = null
  try {
    user = await supabaseGetUser(token)
  } catch {
    user = null
  }

  const userId = user?.id ?? null
  if (userId && (await isAccessTokenInvalidated(userId, token))) {
    store?.byTokenHash.set(hash, null)
    return null
  }

  store?.byTokenHash.set(hash, userId)
  if (userId) {
    void cacheSetJson(cacheKey(hash), { userId }, AUTH_CACHE_TTL_SEC)
  }
  return userId
}

/** Full user object when callers need email/metadata. Prefer local JWT when secret is set. */
export async function resolveSupabaseUserFromAccessToken(token: string): Promise<SupabaseUser | null> {
  const hash = tokenHash(token)
  const jwtSecret = runtimeEnv('SUPABASE_JWT_SECRET')
  if (jwtSecret) {
    const local = verifySupabaseAccessTokenLocally(token, jwtSecret)
    if (local?.sub) {
      if (await isAccessTokenInvalidated(local.sub, token)) return null
      const store = requestAuth.getStore()
      store?.byTokenHash.set(hash, local.sub)
      void cacheSetJson(cacheKey(hash), { userId: local.sub }, AUTH_CACHE_TTL_SEC)
      return {
        id: local.sub,
        email: local.email,
      }
    }
  }

  const userId = await resolveUserIdFromAccessToken(token)
  if (!userId) return null
  try {
    const user = await supabaseGetUser(token)
    return user?.id ? user : { id: userId }
  } catch {
    return { id: userId }
  }
}
