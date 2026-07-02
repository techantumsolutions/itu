/**
 * Redis audit + performance benchmark.
 * Usage: REDIS_URL=redis://127.0.0.1:6379 npx tsx scratch/redis-audit-benchmark.ts [--label before|after]
 */
import { loadEnvConfig } from '@next/env'
import Redis from 'ioredis'
import {
  cacheGetJson,
  cacheSetJson,
  getCacheStats,
  resetCacheStats,
} from '../lib/cache/redis'
import { getQueueSnapshot } from '../lib/jobs/queue'
import { rateLimit } from '../lib/security/rate-limit'
import { invalidatePublicCatalogCache } from '../lib/catalog/invalidate-public-cache'

loadEnvConfig(process.cwd())
if (!process.env.REDIS_URL) process.env.REDIS_URL = 'redis://127.0.0.1:6379'

const LABEL = process.argv.includes('--label')
  ? process.argv[process.argv.indexOf('--label') + 1] ?? 'run'
  : 'run'

const HOT_KEYS = [
  'catalog:public:countries',
  'aggregator:operators:ALL::50:0',
  'aggregator:country-search:ALL',
  'cms:site:default',
]

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function auditRedis(c: Redis) {
  const info = await c.info('memory')
  const mem = Object.fromEntries(
    info
      .split('\r\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split(':'))
      .filter((p) => p.length === 2) as [string, string][],
  )

  const patterns = [
    'catalog:',
    'aggregator:',
    'cms:',
    'rl:',
    'otp:',
    'bull:provider-sync:',
    'bull:provider-health:',
    'pending_register:',
    'temp_2fa_session:',
  ]

  const keyCounts: Record<string, number> = {}
  const ttlSamples: Record<string, { withTtl: number; noTtl: number; avgTtl: number }> = {}

  for (const prefix of patterns) {
    let count = 0
    let withTtl = 0
    let noTtl = 0
    let ttlSum = 0
    let cursor = '0'
    do {
      const res = await c.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500)
      cursor = res[0]
      const keys = res[1] as string[]
      count += keys.length
      if (keys.length) {
        const pipeline = c.pipeline()
        for (const k of keys.slice(0, 20)) pipeline.ttl(k)
        const ttls = (await pipeline.exec())?.map((r) => r?.[1] as number) ?? []
        for (const ttl of ttls) {
          if (ttl === -1) noTtl++
          else if (ttl > 0) {
            withTtl++
            ttlSum += ttl
          }
        }
      }
    } while (cursor !== '0')
    keyCounts[prefix] = count
    ttlSamples[prefix] = {
      withTtl,
      noTtl,
      avgTtl: withTtl ? Math.round(ttlSum / withTtl) : 0,
    }
  }

  return {
    usedMemoryHuman: mem.used_memory_human ?? 'unknown',
    usedMemoryPeakHuman: mem.used_memory_peak_human ?? 'unknown',
    maxmemoryPolicy: mem.maxmemory_policy ?? 'unknown',
    keyCounts,
    ttlSamples,
  }
}

async function benchGets(iterations: number, label: string) {
  resetCacheStats()
  const latencies: number[] = []
  for (let i = 0; i < iterations; i++) {
    const key = HOT_KEYS[i % HOT_KEYS.length]
    const t0 = performance.now()
    await cacheGetJson(key)
    latencies.push(performance.now() - t0)
  }
  latencies.sort((a, b) => a - b)
  const s = getCacheStats()
  const total = s.hits + s.misses + s.l1Hits
  return {
    label,
    iterations,
    p50Ms: Number(percentile(latencies, 50).toFixed(3)),
    p99Ms: Number(percentile(latencies, 99).toFixed(3)),
    avgMs: Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3)),
    hitRatio: total ? Number(((s.hits + s.l1Hits) / total).toFixed(4)) : 0,
    cacheStats: s,
  }
}

async function benchInvalidate() {
  await cacheSetJson('catalog:public:bench-a', { x: 1 }, 120)
  await cacheSetJson('catalog:public:bench-b', { x: 2 }, 120)
  await cacheSetJson('aggregator:bench-c', { x: 3 }, 120)

  const t0 = performance.now()
  await invalidatePublicCatalogCache()
  const invalidateMs = performance.now() - t0

  const t1 = performance.now()
  for (let i = 0; i < 50; i++) {
    await rateLimit({ key: `rl:bench:${i}`, limit: 100, windowSeconds: 60 })
  }
  const rateLimitMs = performance.now() - t1

  return {
    invalidateMs: Number(invalidateMs.toFixed(2)),
    rateLimit50Ms: Number(rateLimitMs.toFixed(2)),
  }
}

async function main() {
  const url = process.env.REDIS_URL!
  const c = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 })
  await c.connect()

  console.log(`\n=== Redis Audit & Benchmark [${LABEL}] ===\n`)

  // Warm L1 + Redis
  for (const key of HOT_KEYS) {
    await cacheSetJson(key, { warm: true, key }, 300)
  }
  for (let i = 0; i < 20; i++) {
    for (const key of HOT_KEYS) await cacheGetJson(key)
  }

  const audit = await auditRedis(c)
  const cold = await benchGets(200, 'cold')
  const warm = await benchGets(500, 'warm')
  const ops = await benchInvalidate()
  const queues = await getQueueSnapshot()

  const report = {
    label: LABEL,
    timestamp: new Date().toISOString(),
    audit,
    benchmark: {
      coldGets: cold,
      warmGets: warm,
      ops,
      queues,
    },
  }

  console.log(JSON.stringify(report, null, 2))
  await c.quit()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
