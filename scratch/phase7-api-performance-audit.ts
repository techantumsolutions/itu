/**
 * Phase 7 — API Performance Audit
 * Usage: npx tsx scratch/phase7-api-performance-audit.ts
 * Env: VERIFY_BASE_URL (default http://127.0.0.1:3000)
 *      VERIFY_ADMIN_EMAIL / VERIFY_ADMIN_PASSWORD for admin/LCR endpoints
 */
import { loadEnvConfig } from '@next/env'
import fs from 'fs'
import path from 'path'

loadEnvConfig(process.cwd())

const BASE = (process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const WARMUP = 1
const RUNS = 5

type Category = 'public' | 'admin' | 'lcr' | 'auth' | 'cron' | 'internal' | 'other'

type StaticRoute = {
  path: string
  methods: string[]
  category: Category
  file: string
  dbQueriesStatic: number
  redisReadsStatic: number
  redisWritesStatic: number
}

type HttpResult = {
  path: string
  category: Category
  status: number
  p50Ms: number
  p99Ms: number
  avgMs: number
  payloadBytes: number
  gzipBytes: number | null
  compressed: boolean
  targetMs: number
  pass: boolean
  cacheSpeedup: number | null
  error?: string
}

const TARGETS: Record<Category, number> = {
  public: 150,
  admin: 300,
  lcr: 500,
  auth: 300,
  cron: 500,
  internal: 300,
  other: 300,
}

function categorize(apiPath: string): Category {
  if (apiPath.startsWith('/api/cron/')) return 'cron'
  if (apiPath.startsWith('/api/admin/lcr/') || apiPath.startsWith('/api/admin/aggregator/')) return 'lcr'
  if (apiPath.startsWith('/api/admin/')) return 'admin'
  if (apiPath.startsWith('/api/auth/')) return 'auth'
  if (
    apiPath.startsWith('/api/countries') ||
    apiPath.startsWith('/api/plans') ||
    apiPath.startsWith('/api/providers') ||
    apiPath.startsWith('/api/cms') ||
    apiPath.startsWith('/api/catalog/') ||
    apiPath.startsWith('/api/geo') ||
    apiPath.startsWith('/api/ads') ||
    apiPath.startsWith('/api/operators') ||
    apiPath.startsWith('/api/operator/') ||
    apiPath.startsWith('/api/products') ||
    apiPath.startsWith('/api/settings/') ||
    apiPath === '/api/health'
  ) {
    return 'public'
  }
  if (apiPath.startsWith('/api/test-')) return 'internal'
  return 'other'
}

function routePathFromFile(file: string): string {
  const rel = file.replace(/\\/g, '/').split('/app/api/')[1]
  if (!rel) return ''
  const withoutRoute = rel.replace(/\/route\.ts$/, '')
  const segments = withoutRoute.split('/').map((s) => {
    if (s.startsWith('[') && s.endsWith(']')) return '00000000-0000-0000-0000-000000000001'
    return s
  })
  return `/api/${segments.join('/')}`
}

function countPattern(src: string, pattern: RegExp): number {
  return (src.match(pattern) ?? []).length
}

function discoverRoutes(): StaticRoute[] {
  const apiRoot = path.join(process.cwd(), 'app', 'api')
  const routes: StaticRoute[] = []

  function walk(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.name === 'route.ts') {
        const src = fs.readFileSync(full, 'utf8')
        const methods: string[] = []
        for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
          if (new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(src)) methods.push(m)
        }
        const apiPath = routePathFromFile(full)
        routes.push({
          path: apiPath,
          methods,
          category: categorize(apiPath),
          file: full,
          dbQueriesStatic: countPattern(src, /\bsupabaseRest\s*\(/g),
          redisReadsStatic: countPattern(src, /\bcacheGetJson\s*\(/g),
          redisWritesStatic: countPattern(src, /\bcacheSetJson\s*\(/g),
        })
      }
    }
  }

  walk(apiRoot)
  const byPath = new Map<string, StaticRoute>()
  for (const r of routes) {
    if (!byPath.has(r.path) || r.methods.length > (byPath.get(r.path)?.methods.length ?? 0)) {
      byPath.set(r.path, r)
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function measure(
  urlPath: string,
  category: Category,
  init: RequestInit = {},
): Promise<HttpResult> {
  const targetMs = TARGETS[category]
  const latencies: number[] = []
  let lastStatus = 0
  let payloadBytes = 0
  let gzipBytes: number | null = null
  let compressed = false
  let error: string | undefined

  const headers = new Headers(init.headers)
  headers.set('Accept-Encoding', 'gzip, deflate, br')

  try {
    for (let i = 0; i < WARMUP + RUNS; i++) {
      const t0 = performance.now()
      const res = await fetch(`${BASE}${urlPath}`, { ...init, headers })
      const body = await res.arrayBuffer()
      const ms = performance.now() - t0
      if (i >= WARMUP) latencies.push(ms)
      lastStatus = res.status
      payloadBytes = body.byteLength
      compressed = Boolean(res.headers.get('content-encoding'))
      if (i === WARMUP + RUNS - 1) {
        const gzipRes = await fetch(`${BASE}${urlPath}`, {
          ...init,
          headers: new Headers({ ...(init.headers as object), 'Accept-Encoding': 'gzip' }),
        })
        const gzipBody = await gzipRes.arrayBuffer()
        gzipBytes = gzipBody.byteLength
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  latencies.sort((a, b) => a - b)
  const p50Ms = Number(percentile(latencies, 50).toFixed(1))
  const p99Ms = Number(percentile(latencies, 99).toFixed(1))
  const avgMs = latencies.length
    ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1))
    : 0

  return {
    path: urlPath,
    category,
    status: lastStatus,
    p50Ms,
    p99Ms,
    avgMs,
    payloadBytes,
    gzipBytes,
    compressed,
    targetMs,
    pass: !error && lastStatus < 500 && p50Ms <= targetMs,
    cacheSpeedup: null,
    error,
  }
}

async function measureCacheSpeedup(urlPath: string, category: Category): Promise<number | null> {
  try {
    await fetch(`${BASE}${urlPath}`, { headers: { 'Cache-Control': 'no-cache' } })
    const t1 = performance.now()
    await fetch(`${BASE}${urlPath}`)
    const cold = performance.now() - t1
    const t2 = performance.now()
    await fetch(`${BASE}${urlPath}`)
    const warm = performance.now() - t2
    if (warm <= 0) return null
    return Number((cold / warm).toFixed(2))
  } catch {
    return null
  }
}

async function adminCookie(): Promise<string | null> {
  const email = process.env.VERIFY_ADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@itu.com'
  const password = process.env.VERIFY_ADMIN_PASSWORD ?? process.env.ADMIN_BOOTSTRAP_PASSWORD
  if (!password?.trim()) {
    throw new Error('Set VERIFY_ADMIN_PASSWORD or ADMIN_BOOTSTRAP_PASSWORD')
  }
  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, source: 'admin' }),
    })
    const json = (await res.json()) as { ok?: boolean; user?: { id: string } }
    const token = res.headers.get('set-cookie')?.match(/sb-access-token=([^;]+)/)?.[1]
    if (!json.ok || !json.user?.id || !token) return null
    return `sb-access-token=${decodeURIComponent(token)}; itu-user-id=${json.user.id}`
  } catch {
    return null
  }
}

function pickBenchmarkEndpoints(routes: StaticRoute[]): Array<{ path: string; category: Category; auth?: boolean }> {
  const picked: Array<{ path: string; category: Category; auth?: boolean }> = []

  const mustPublic = [
    '/api/health',
    '/api/countries',
    '/api/providers?country=MEX',
    '/api/plans?country=MEX&limit=20',
    '/api/cms',
    '/api/catalog/operators?country=MEX&limit=20',
    '/api/catalog/plans?limit=20',
    '/api/catalog/search/countries',
    '/api/geo',
    '/api/ads',
    '/api/settings/recharge-processing-fees',
    '/api/auth/session-config',
  ]

  const mustAdmin = [
    '/api/admin/dashboard',
    '/api/admin/customers?limit=10',
    '/api/admin/transactions?limit=10',
    '/api/admin/routing-rules',
    '/api/admin/provider-priorities',
    '/api/admin/activity-logs?limit=10',
  ]

  const mustLcr = [
    '/api/admin/lcr/providers',
    '/api/admin/lcr/settings',
    '/api/admin/lcr/countries',
    '/api/admin/lcr/system-plans?limit=10',
    '/api/admin/lcr/internal-plans?limit=10',
    '/api/admin/lcr/review-queue?limit=10',
    '/api/admin/aggregator/operators?limit=10',
    '/api/admin/aggregator/plans?limit=10',
    '/api/admin/aggregator/cron-status',
  ]

  for (const p of mustPublic) picked.push({ path: p, category: 'public' })
  for (const p of mustAdmin) picked.push({ path: p, category: 'admin', auth: true })
  for (const p of mustLcr) picked.push({ path: p, category: 'lcr', auth: true })

  for (const r of routes) {
    if (!r.methods.includes('GET')) continue
    if (r.path.includes('[')) continue
    if (picked.some((p) => p.path.split('?')[0] === r.path)) continue
    if (r.category === 'public' && picked.filter((x) => x.category === 'public').length < 20) {
      picked.push({ path: r.path, category: r.category })
    }
  }

  return picked
}

async function main() {
  console.log('=== Phase 7 API Performance Audit ===\n')
  console.log(`Base URL: ${BASE}\n`)

  const routes = discoverRoutes()
  const cookie = await adminCookie()

  const staticSummary = {
    totalRoutes: routes.length,
    byCategory: {} as Record<string, number>,
    withRedisCache: routes.filter((r) => r.redisReadsStatic > 0).length,
    avgDbQueriesPublic: 0,
  }

  for (const r of routes) {
    staticSummary.byCategory[r.category] = (staticSummary.byCategory[r.category] ?? 0) + 1
  }
  const publicRoutes = routes.filter((r) => r.category === 'public')
  staticSummary.avgDbQueriesPublic =
    publicRoutes.length > 0
      ? Number(
          (publicRoutes.reduce((s, r) => s + r.dbQueriesStatic, 0) / publicRoutes.length).toFixed(2),
        )
      : 0

  const endpoints = pickBenchmarkEndpoints(routes)
  const httpResults: HttpResult[] = []

  for (const ep of endpoints) {
    const init: RequestInit = {}
    if (ep.auth && cookie) init.headers = { cookie }
    const result = await measure(ep.path, ep.category, init)
    if (ep.category === 'public' && !ep.path.includes('health')) {
      result.cacheSpeedup = await measureCacheSpeedup(ep.path.split('?')[0] + (ep.path.includes('?') ? '?' + ep.path.split('?')[1] : ''), ep.category)
    }
    httpResults.push(result)
    const flag = result.pass ? 'PASS' : 'FAIL'
    console.log(
      `[${flag}] ${result.category.padEnd(6)} p50=${String(result.p50Ms).padStart(7)}ms target<=${result.targetMs}ms ${result.status} ${result.path}`,
    )
  }

  const failures = httpResults.filter((r) => !r.pass)
  const compressionEnabled = httpResults.filter((r) => r.compressed).length
  const cacheable = httpResults.filter((r) => r.cacheSpeedup != null)
  const avgCacheSpeedup =
    cacheable.length > 0
      ? Number((cacheable.reduce((s, r) => s + (r.cacheSpeedup ?? 1), 0) / cacheable.length).toFixed(2))
      : 0

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE,
    targets: TARGETS,
    inventory: staticSummary,
    routes: routes.map((r) => ({
      path: r.path,
      category: r.category,
      methods: r.methods,
      dbQueriesStatic: r.dbQueriesStatic,
      redisReads: r.redisReadsStatic,
      redisWrites: r.redisWritesStatic,
    })),
    httpBenchmarks: httpResults,
    summary: {
      endpointsTested: httpResults.length,
      pass: httpResults.filter((r) => r.pass).length,
      fail: failures.length,
      compressionResponses: compressionEnabled,
      avgCacheSpeedupWarmVsCold: avgCacheSpeedup,
      failures: failures.map((f) => ({
        path: f.path,
        category: f.category,
        p50Ms: f.p50Ms,
        targetMs: f.targetMs,
        status: f.status,
        error: f.error,
      })),
    },
  }

  const outPath = path.join(process.cwd(), 'scratch', 'phase7-api-performance-report.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

  console.log('\n--- Summary ---')
  console.log(`Routes inventoried: ${staticSummary.totalRoutes}`)
  console.log(`HTTP benchmarks: ${report.summary.pass}/${report.summary.endpointsTested} PASS`)
  console.log(`Compression (content-encoding): ${compressionEnabled}/${httpResults.length} responses`)
  console.log(`Avg cache warm speedup ratio: ${avgCacheSpeedup}x`)
  console.log(`Public routes w/ Redis read in handler: ${staticSummary.withRedisCache}`)
  console.log(`Report: ${outPath}`)

  if (failures.length > 0) {
    console.log('\n--- Failures (p50 exceeds target) ---')
    for (const f of failures) {
      console.log(`  ${f.category} ${f.path} — ${f.p50Ms}ms > ${f.targetMs}ms (status ${f.status})`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
