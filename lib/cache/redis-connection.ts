/**
 * Shared Redis URL + AUTH resolution for ioredis and BullMQ clients.
 * Production requires a password (REDIS_PASSWORD or embedded in REDIS_URL).
 */
import { runtimeEnv } from '@/lib/env/runtime'

export type RedisConnectionOptions = {
  url: string
  connectTimeout?: number
  maxRetriesPerRequest?: number | null
  enableOfflineQueue?: boolean
  lazyConnect?: boolean
  enableReadyCheck?: boolean
  retryStrategy?: (times: number) => number | null
  tls?: Record<string, unknown>
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** True when the Redis URL embeds a non-empty password. */
export function redisUrlHasPassword(url: string): boolean {
  try {
    const parsed = new URL(url)
    return Boolean(parsed.password)
  } catch {
    return false
  }
}

/** Inject REDIS_PASSWORD into a URL that has no password yet. */
export function injectRedisPassword(url: string, password: string): string {
  const parsed = new URL(url)
  if (!parsed.password) {
    parsed.password = password
  }
  return parsed.toString()
}

/**
 * Resolve the effective Redis URL.
 * Prefers REDIS_URL; if REDIS_PASSWORD is set and the URL has no password, injects it.
 */
export function resolveRedisUrl(): string | undefined {
  const raw = runtimeEnv('REDIS_URL')
  if (!raw) return undefined
  const password = runtimeEnv('REDIS_PASSWORD')
  if (password && !redisUrlHasPassword(raw)) {
    return injectRedisPassword(raw, password)
  }
  return raw
}

/**
 * Production must use Redis AUTH. Call before connecting in prod.
 * @throws Error when production Redis has no password configured
 */
export function assertProductionRedisAuth(url?: string | null): void {
  if (!isProductionRuntime()) return
  const effective = (url ?? resolveRedisUrl())?.trim()
  if (!effective) {
    throw new Error('REDIS_URL is required in production')
  }
  if (redisUrlHasPassword(effective) || runtimeEnv('REDIS_PASSWORD')) {
    return
  }
  throw new Error(
    'Production Redis requires AUTH: set REDIS_PASSWORD or include a password in REDIS_URL (redis://:secret@host:6379)',
  )
}

/** Soft validation for readiness probes (does not throw). */
export function validateProductionRedisAuth(): { ok: true } | { ok: false; detail: string } {
  try {
    assertProductionRedisAuth()
    return { ok: true }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'redis_auth_invalid' }
  }
}

/** Options for a short-lived or shared ioredis client. */
export function buildRedisOptions(
  overrides: Partial<RedisConnectionOptions> = {},
): RedisConnectionOptions | null {
  const url = resolveRedisUrl()
  if (!url) return null
  assertProductionRedisAuth(url)
  return {
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    // Exponential backoff with cap; null previously prevented reconnect after blips.
    retryStrategy: (times) => Math.min(times * 200, 5_000),
    tls: url.startsWith('rediss://') ? {} : undefined,
    ...overrides,
    url, // keep resolved URL even if overrides omit it
  }
}

/** BullMQ connection — requires maxRetriesPerRequest: null for blocking commands. */
export function buildBullMqConnection(): {
  connection: { url: string; maxRetriesPerRequest: null; enableReadyCheck: boolean }
} | null {
  const url = resolveRedisUrl()
  if (!url) return null
  assertProductionRedisAuth(url)
  return {
    connection: {
      url,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
  }
}
