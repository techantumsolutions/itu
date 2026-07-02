import { runtimeEnv } from '@/lib/env/runtime'
import Redis from 'ioredis'

let client: Redis | null = null
let connecting: Promise<void> | null = null

/** Process-local L1 cache — avoids Redis round-trips for burst reads of the same key. */
const L1_MAX_ENTRIES = 512
const L1_TTL_MS = 2_000
const l1Cache = new Map<string, { raw: string; expiresAt: number }>()

export type CacheStats = {
  hits: number
  misses: number
  l1Hits: number
  sets: number
  dels: number
  errors: number
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  l1Hits: 0,
  sets: 0,
  dels: 0,
  errors: 0,
}

export function getCacheStats(): Readonly<CacheStats> {
  return { ...stats }
}

export function resetCacheStats(): void {
  stats.hits = 0
  stats.misses = 0
  stats.l1Hits = 0
  stats.sets = 0
  stats.dels = 0
  stats.errors = 0
}

/** @internal test helper */
export function clearLocalCacheForTests(): void {
  l1Cache.clear()
}

function l1Get(key: string): string | null {
  const entry = l1Cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    l1Cache.delete(key)
    return null
  }
  l1Cache.delete(key)
  l1Cache.set(key, entry)
  return entry.raw
}

function l1Set(key: string, raw: string): void {
  if (l1Cache.size >= L1_MAX_ENTRIES) {
    const oldest = l1Cache.keys().next().value
    if (oldest) l1Cache.delete(oldest)
  }
  l1Cache.set(key, { raw, expiresAt: Date.now() + L1_TTL_MS })
}

function l1Del(key: string): void {
  l1Cache.delete(key)
}

function l1DelByPrefix(prefix: string): void {
  for (const key of l1Cache.keys()) {
    if (key.startsWith(prefix)) l1Cache.delete(key)
  }
}

function getRedisClient(): Redis | null {
  const url = runtimeEnv('REDIS_URL')
  if (!url) return null

  if (client) return client
  const c = new Redis(url, {
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null,
    tls: url.startsWith('rediss://') ? {} : undefined,
  })

  c.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('[redis] connect')
  })
  c.on('error', () => {
    // swallow; callers will fall back to origin fetch
  })

  client = c
  return c
}

async function ensureConnected(c: Redis, timeoutMs = 800): Promise<void> {
  if (c.status === 'ready') return
  if (!connecting) {
    connecting = c.connect().finally(() => {
      connecting = null
    })
  }
  await Promise.race([
    connecting,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('redis_connect_timeout')), timeoutMs)),
  ])
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const l1Raw = l1Get(key)
  if (l1Raw != null) {
    stats.l1Hits++
    try {
      return JSON.parse(l1Raw) as T
    } catch {
      l1Del(key)
    }
  }

  const c = getRedisClient()
  if (!c) {
    stats.misses++
    return null
  }
  try {
    await ensureConnected(c)
    const raw = await c.get(key)
    if (!raw) {
      stats.misses++
      return null
    }
    stats.hits++
    l1Set(key, raw)
    return JSON.parse(raw) as T
  } catch {
    stats.errors++
    stats.misses++
    return null
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const c = getRedisClient()
  if (!c) return
  try {
    const raw = JSON.stringify(value)
    await ensureConnected(c)
    await c.set(key, raw, 'EX', Math.max(1, ttlSeconds))
    l1Set(key, raw)
    stats.sets++
  } catch {
    stats.errors++
  }
}

export async function cacheDel(key: string): Promise<void> {
  l1Del(key)
  const c = getRedisClient()
  if (!c) return
  try {
    await ensureConnected(c)
    await c.unlink(key)
    stats.dels++
  } catch {
    stats.errors++
  }
}

export async function cacheDelByPrefix(prefix: string): Promise<number> {
  l1DelByPrefix(prefix)
  const c = getRedisClient()
  if (!c) return 0
  let count = 0
  try {
    await ensureConnected(c)
    let cursor = '0'
    do {
      const res = await c.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500)
      cursor = res[0] as string
      const keys = res[1] as string[]
      if (keys.length) {
        const pipeline = c.pipeline()
        for (const k of keys) pipeline.unlink(k)
        await pipeline.exec()
        count += keys.length
        stats.dels += keys.length
      }
    } while (cursor !== '0')
  } catch {
    stats.errors++
    return count
  }
  return count
}

/** Delete multiple key namespaces in parallel (fewer round-trips than sequential awaits). */
export async function cacheDelByPrefixes(prefixes: string[]): Promise<number> {
  const counts = await Promise.all(prefixes.map((p) => cacheDelByPrefix(p)))
  return counts.reduce((sum, n) => sum + n, 0)
}

export function getRedisRaw(): Redis | null {
  return getRedisClient()
}

export async function redisExec<T>(fn: (c: Redis) => Promise<T>, timeoutMs = 800): Promise<T> {
  const c = getRedisClient()
  if (!c) throw new Error('redis_not_configured')
  await ensureConnected(c, timeoutMs)
  return fn(c)
}
