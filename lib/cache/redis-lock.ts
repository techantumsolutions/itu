/**
 * Distributed lock via Redis SET NX EX — prevents overlapping cron/worker sweeps.
 */

import { redisExec } from '@/lib/cache/redis'
import { randomUUID } from 'node:crypto'

export async function withRedisLock<T>(
  lockKey: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  const token = randomUUID()
  let acquired = false
  try {
    const ok = await redisExec(async (c) => {
      const res = await c.set(lockKey, token, 'EX', Math.max(1, ttlSeconds), 'NX')
      return res === 'OK'
    })
    acquired = ok
  } catch {
    // Redis unavailable — fail closed for duplicate work (skip) in workers
    return { acquired: false }
  }

  if (!acquired) return { acquired: false }

  try {
    const result = await fn()
    return { acquired: true, result }
  } finally {
    try {
      await redisExec(async (c) => {
        const cur = await c.get(lockKey)
        if (cur === token) await c.unlink(lockKey)
      })
    } catch {
      // TTL will expire
    }
  }
}
