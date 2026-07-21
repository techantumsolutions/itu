/**
 * Prometheus metrics (prom-client). Node.js runtime only.
 */
import client from 'prom-client'
import { checkRedis } from '@/lib/health/runtime-checks'

const g = globalThis as typeof globalThis & {
  __ituMetrics?: {
    registry: client.Registry
    httpRequests: client.Counter<string>
    httpDuration: client.Histogram<string>
    httpErrors: client.Counter<string>
    httpActive: client.Gauge<string>
    dbDuration: client.Histogram<string>
    redisUp: client.Gauge<string>
    queueJobs: client.Gauge<string>
    providerCalls: client.Counter<string>
  }
}

function normalizeRoute(raw: string | undefined): string {
  if (!raw) return 'unknown'
  try {
    const path = raw.split('?')[0] || '/'
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '/:uuid')
      .replace(/\/[0-9a-f]{24,}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .slice(0, 120)
  } catch {
    return 'unknown'
  }
}

function ensureMetrics() {
  if (g.__ituMetrics) return g.__ituMetrics

  const registry = new client.Registry()
  client.collectDefaultMetrics({ register: registry, prefix: 'itu_' })

  const httpRequests = new client.Counter({
    name: 'itu_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  })
  const httpDuration = new client.Histogram({
    name: 'itu_http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  })
  const httpErrors = new client.Counter({
    name: 'itu_http_errors_total',
    help: 'HTTP responses with status >= 500',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  })
  const httpActive = new client.Gauge({
    name: 'itu_http_active_requests',
    help: 'In-flight HTTP requests',
    registers: [registry],
  })
  const dbDuration = new client.Histogram({
    name: 'itu_db_query_duration_seconds',
    help: 'Supabase/PostgREST call duration',
    labelNames: ['operation'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  })
  const redisUp = new client.Gauge({
    name: 'itu_redis_up',
    help: 'Redis connectivity (1=up, 0=down)',
    registers: [registry],
  })
  const queueJobs = new client.Gauge({
    name: 'itu_bullmq_jobs',
    help: 'BullMQ job counts by queue and state',
    labelNames: ['queue', 'state'],
    registers: [registry],
  })
  const providerCalls = new client.Counter({
    name: 'itu_provider_calls_total',
    help: 'Outbound provider API calls',
    labelNames: ['provider', 'ok'],
    registers: [registry],
  })

  g.__ituMetrics = {
    registry,
    httpRequests,
    httpDuration,
    httpErrors,
    httpActive,
    dbDuration,
    redisUp,
    queueJobs,
    providerCalls,
  }
  return g.__ituMetrics
}

export function recordHttpRequest(input: {
  method: string
  route: string
  status: number
  durationSeconds: number
}) {
  const m = ensureMetrics()
  const route = normalizeRoute(input.route)
  const method = (input.method || 'GET').toUpperCase()
  const status = String(input.status || 0)
  const labels = { method, route, status }
  m.httpRequests.inc(labels)
  m.httpDuration.observe(labels, input.durationSeconds)
  if (input.status >= 500) m.httpErrors.inc(labels)
}

export function httpActiveInc() {
  ensureMetrics().httpActive.inc()
}
export function httpActiveDec() {
  ensureMetrics().httpActive.dec()
}

export function recordDbQuery(operation: string, durationSeconds: number) {
  ensureMetrics().dbDuration.observe({ operation: operation.slice(0, 64) }, durationSeconds)
}

export function recordProviderCall(provider: string, ok: boolean) {
  ensureMetrics().providerCalls.inc({ provider: provider.slice(0, 64), ok: ok ? '1' : '0' })
}

async function refreshDependencyGauges() {
  const m = ensureMetrics()
  try {
    const redis = await checkRedis()
    m.redisUp.set(redis.ok ? 1 : 0)
  } catch {
    m.redisUp.set(0)
  }

  try {
    const { getQueueSnapshot } = await import('@/lib/jobs/queue')
    const snap = await getQueueSnapshot()
    const apply = (queue: string, counts: Record<string, number> | null | undefined) => {
      if (!counts) return
      for (const [state, value] of Object.entries(counts)) {
        if (typeof value === 'number') m.queueJobs.set({ queue, state }, value)
      }
    }
    apply('provider-sync', snap.providerSync as Record<string, number> | null)
    apply('provider-health', snap.providerHealth as Record<string, number> | null)
  } catch {
    // ignore — metrics scrape should still succeed
  }
}

export async function renderPrometheusMetrics(): Promise<string> {
  await refreshDependencyGauges()
  return ensureMetrics().registry.metrics()
}

export function prometheusContentType(): string {
  return ensureMetrics().registry.contentType
}

/**
 * Patch Node HTTP server request/response to record latency + status
 * without modifying individual route handlers.
 */
export function installHttpMetricsHooks(): void {
  if ((globalThis as { __ituHttpMetrics?: boolean }).__ituHttpMetrics) return
  ;(globalThis as { __ituHttpMetrics?: boolean }).__ituHttpMetrics = true

  // Lazy require to avoid edge bundling issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = require('node:http') as typeof import('node:http')
  const originalEmit = http.Server.prototype.emit

  http.Server.prototype.emit = function (this: unknown, event: string, ...args: unknown[]) {
    if (event === 'request') {
      const req = args[0] as import('node:http').IncomingMessage
      const res = args[1] as import('node:http').ServerResponse
      const start = process.hrtime.bigint()
      httpActiveInc()
      let finished = false
      const done = () => {
        if (finished) return
        finished = true
        httpActiveDec()
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9
        recordHttpRequest({
          method: req.method || 'GET',
          route: req.url || '/',
          status: res.statusCode || 0,
          durationSeconds,
        })
      }
      res.on('finish', done)
      res.on('close', done)
    }
    return (originalEmit as (...a: unknown[]) => boolean).apply(this, [event, ...args])
  }
}
