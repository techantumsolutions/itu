import { redisExec } from '@/lib/cache/redis'

export async function rateLimit(opts: { key: string; limit: number; windowSeconds: number }) {
  try {
    const script = `
      local current = redis.call("INCR", KEYS[1])
      if current == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
      local remaining = tonumber(ARGV[2]) - current
      local ttl = redis.call("TTL", KEYS[1])
      return { current, remaining, ttl }
    `

    const [current, remaining, ttl] = (await redisExec((redis) =>
      redis.eval(script, 1, opts.key, String(opts.windowSeconds), String(opts.limit)),
    )) as [number, number, number]

    return {
      ok: current <= opts.limit,
      remaining: Math.max(0, remaining),
      resetSeconds: Math.max(0, ttl),
    }
  } catch {
    // If Redis is down/unconfigured, don't accidentally lock users out.
    return { ok: true as const, remaining: opts.limit, resetSeconds: opts.windowSeconds }
  }
}

