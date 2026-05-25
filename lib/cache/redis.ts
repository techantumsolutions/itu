import { runtimeEnv } from '@/lib/env/runtime'
import Redis from 'ioredis'

let client: Redis | null = null
let connecting: Promise<void> | null = null

function getRedisClient(): Redis | null {
  const url = runtimeEnv('REDIS_URL')
  if (!url) return null

  if (client) return client
  const c = new Redis(url, {
    // Never block API responses if Redis is down.
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    // We disable offline queue, and explicitly connect when needed.
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
  const c = getRedisClient()
  if (!c) return null
  try {
    await ensureConnected(c)
    const raw = await c.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const c = getRedisClient()
  if (!c) return
  try {
    await ensureConnected(c)
    await c.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSeconds))
  } catch {
    // ignore
  }
}

export async function cacheDel(key: string): Promise<void> {
  const c = getRedisClient()
  if (!c) return
  try {
    await ensureConnected(c)
    await c.del(key)
  } catch {
    // ignore
  }
}

export async function cacheDelByPrefix(prefix: string): Promise<number> {
  const c = getRedisClient()
  if (!c) return 0
  let count = 0
  try {
    await ensureConnected(c)
    let cursor = '0'
    do {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const res = await c.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      cursor = res[0] as string
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const keys = res[1] as string[]
      if (keys.length) {
        await c.del(...keys)
        count += keys.length
      }
    } while (cursor !== '0')
  } catch {
    return count
  }
  return count
}

// Expose raw client for OTP / rate limiting scripts.
export function getRedisRaw(): Redis | null {
  return getRedisClient()
}

export async function redisExec<T>(fn: (c: Redis) => Promise<T>, timeoutMs = 800): Promise<T> {
  const c = getRedisClient()
  if (!c) throw new Error('redis_not_configured')
  await ensureConnected(c, timeoutMs)
  return fn(c)
}
