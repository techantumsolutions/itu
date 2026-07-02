import { redisExec } from '@/lib/cache/redis'

const RATE_LIMIT_SCRIPT = `
  local current = redis.call("INCR", KEYS[1])
  if current == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
  local remaining = tonumber(ARGV[2]) - current
  local ttl = redis.call("TTL", KEYS[1])
  return { current, remaining, ttl }
`

let rateLimitSha: string | null = null

async function evalRateLimit(key: string, windowSeconds: number, limit: number): Promise<[number, number, number]> {
  return redisExec(async (redis) => {
    if (!rateLimitSha) {
      rateLimitSha = (await redis.script('LOAD', RATE_LIMIT_SCRIPT)) as string
    }
    try {
      return (await redis.evalsha(
        rateLimitSha,
        1,
        key,
        String(windowSeconds),
        String(limit),
      )) as [number, number, number]
    } catch {
      rateLimitSha = null
      return (await redis.eval(
        RATE_LIMIT_SCRIPT,
        1,
        key,
        String(windowSeconds),
        String(limit),
      )) as [number, number, number]
    }
  })
}

export async function rateLimit(opts: { key: string; limit: number; windowSeconds: number }) {
  try {
    const [current, remaining, ttl] = await evalRateLimit(opts.key, opts.windowSeconds, opts.limit)

    return {
      ok: current <= opts.limit,
      remaining: Math.max(0, remaining),
      resetSeconds: Math.max(0, ttl),
    }
  } catch {
    return { ok: true as const, remaining: opts.limit, resetSeconds: opts.windowSeconds }
  }
}
