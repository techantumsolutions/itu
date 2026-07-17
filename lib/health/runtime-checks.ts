/**
 * Lightweight readiness probes for container orchestration.
 * Connectivity only — no catalog/business queries.
 */
import { runtimeEnv } from '@/lib/env/runtime'
import Redis from 'ioredis'

const PROBE_TIMEOUT_MS = 2_000

export type DependencyCheck = {
  ok: boolean
  detail?: string
}

function normalizeSupabaseBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/$/, '')
}

/** Redis PING with a short-lived client (does not reuse the app cache client). */
export async function checkRedis(): Promise<DependencyCheck> {
  const url = runtimeEnv('REDIS_URL')?.trim()
  if (!url) return { ok: false, detail: 'REDIS_URL missing' }

  const client = new Redis(url, {
    maxRetriesPerRequest: 0,
    enableReadyCheck: true,
    connectTimeout: PROBE_TIMEOUT_MS,
    lazyConnect: true,
  })

  try {
    await client.connect()
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS),
      ),
    ])
    if (pong !== 'PONG') return { ok: false, detail: `unexpected ping: ${String(pong)}` }
    return { ok: true }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'redis_unreachable' }
  } finally {
    try {
      await client.quit()
    } catch {
      client.disconnect()
    }
  }
}

/**
 * Smallest Supabase connectivity check: GoTrue /auth/v1/health (no table scan).
 * Falls back to HEAD /rest/v1/ if auth health is unavailable.
 */
export async function checkSupabase(): Promise<DependencyCheck> {
  const baseRaw = runtimeEnv('SUPABASE_URL')?.trim()
  const key = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!baseRaw || !key) {
    return { ok: false, detail: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing' }
  }

  const base = normalizeSupabaseBaseUrl(baseRaw)
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  try {
    const authRes = await fetch(`${base}/auth/v1/health`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (authRes.ok) return { ok: true }

    const restRes = await fetch(`${base}/rest/v1/`, {
      method: 'HEAD',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    // PostgREST may return 200 or 404 for bare /rest/v1/; both prove the gateway answered.
    if (restRes.status < 500) return { ok: true }
    return { ok: false, detail: `supabase status=${restRes.status}` }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'supabase_unreachable' }
  }
}

export async function checkWebReadiness(): Promise<{
  ok: boolean
  redis: DependencyCheck
  supabase: DependencyCheck
}> {
  const [redis, supabase] = await Promise.all([checkRedis(), checkSupabase()])
  return { ok: redis.ok && supabase.ok, redis, supabase }
}
