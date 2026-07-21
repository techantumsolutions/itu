# Observability (ITU)

Production-grade logging, correlation IDs, Prometheus metrics, and Sentry — without changing business logic.

## Execution flow

```
Client / LB
  → proxy.ts sets/propagates X-Request-ID
  → Next.js route handlers / pages
      → Node HTTP hook (instrumentation) records latency/status → Prometheus
      → console.* bridged to JSON logger (production)
      → Supabase REST timed → itu_db_query_duration_seconds
      → Provider HTTP calls carry X-Request-ID / X-Correlation-Id
  → BullMQ jobs include requestId; worker restores ALS context
  → Sentry captures uncaught errors + onRequestError + worker failures
  → GET /api/metrics (Prometheus scrape)
  → GET /api/health | /api/health/ready (dependency status, no secrets)
```

## Log format

Production (`NODE_ENV=production` or `LOG_FORMAT=json`) emits one JSON object per line:

| Field | Description |
|-------|-------------|
| `timestamp` | ISO-8601 |
| `level` | debug \| info \| warn \| error |
| `message` | Event name / text |
| `service` | `SERVICE_NAME` / `OTEL_SERVICE_NAME` |
| `environment` | `APP_ENV` or `NODE_ENV` |
| `requestId` | Correlation ID |
| `userId` | When set on context (`x-user-id` header) |
| `route` | Path or job route |
| `duration` | Milliseconds (when applicable) |
| `version` | `APP_VERSION` / `DEPLOY_SHA` |
| `stack` | Error stack (errors only) |

Dev defaults to pretty console; set `LOG_FORMAT=json` to force JSON locally.

## Correlation IDs

- Header: `X-Request-ID` (also sent outbound as `X-Correlation-Id` to providers)
- Generated in `proxy.ts` when absent; propagated inbound → response
- Stored in AsyncLocalStorage (`lib/observability/context.ts`) for Node code
- BullMQ: `enqueueProviderSync` embeds `requestId` in job data; worker restores context

## Metrics (`GET /api/metrics`)

Prometheus text exposition (`prom-client`).

| Metric | Type | Labels |
|--------|------|--------|
| `itu_http_requests_total` | Counter | method, route, status |
| `itu_http_request_duration_seconds` | Histogram | method, route, status |
| `itu_http_errors_total` | Counter | method, route, status |
| `itu_http_active_requests` | Gauge | — |
| `itu_db_query_duration_seconds` | Histogram | operation |
| `itu_redis_up` | Gauge | — |
| `itu_bullmq_jobs` | Gauge | queue, state |
| `itu_provider_calls_total` | Counter | provider, ok |
| `itu_*` process defaults | — | collectDefaultMetrics |

### Auth

- If `METRICS_TOKEN` is set: require `Authorization: Bearer <token>` or `?token=`
- If unset: only loopback scrapes are allowed

### Example scrape (Prometheus)

```yaml
scrape_configs:
  - job_name: itu-web
    metrics_path: /api/metrics
    authorization:
      credentials: '<METRICS_TOKEN>'
    static_configs:
      - targets: ['web:3000']  # or host:4009 from outside compose
```

## Sentry

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Server / worker DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser DSN (optional) |
| `SENTRY_TRACES_SAMPLE_RATE` | Server traces (default `0.1`) |
| `APP_VERSION` / `DEPLOY_SHA` | Release tag |

Disabled when DSN is empty (no-op). Captures: uncaught exceptions, unhandled rejections, `onRequestError`, worker job failures.

## Health

| Endpoint | Meaning |
|----------|---------|
| `/api/health` | Liveness + version/env (no dependency checks) |
| `/api/health/ready` | Redis + database connectivity; sanitized `detail` (no secrets) |

## Environment variables

```bash
# Logging
LOG_FORMAT=json|pretty
LOG_LEVEL=debug          # optional
LOG_CONSOLE_BRIDGE=1|0   # force/disable console→JSON bridge
SERVICE_NAME=itu-web
APP_ENV=production
APP_VERSION=<git-sha>

# Metrics
METRICS_TOKEN=<random-secret>

# Sentry
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_TRACES_SAMPLE_RATE=0.1
```

## Production setup

1. Set `SENTRY_DSN`, `METRICS_TOKEN`, `LOG_FORMAT=json`, `APP_ENV=production` in VPS `.env`
2. Deploy as usual (compose already sets `LOG_FORMAT=json`, `APP_ENV=production`, `APP_VERSION` from `DEPLOY_SHA`)
3. Point Prometheus at `https://<host>/api/metrics` with bearer token
4. Optional Grafana: import Prometheus datasource; panel `rate(itu_http_requests_total[5m])`, `itu_redis_up`, `itu_bullmq_jobs`

## Verification checklist

- [ ] `curl -sI https://<host>/api/health` includes `x-request-id` (via middleware on HTML too; APIs return JSON body with version)
- [ ] `curl -s https://<host>/api/health/ready` shows `checks.redis` / `checks.database` without passwords
- [ ] `curl -s -H "Authorization: Bearer $METRICS_TOKEN" https://<host>/api/metrics | head` shows `itu_http_requests_total`
- [ ] Trigger an API call; container logs show JSON with `requestId`
- [ ] Enqueue provider sync; worker logs share the same `requestId` when job carries it
- [ ] With `SENTRY_DSN` set, Issues appear for a deliberate test exception
- [ ] Business flows (login, checkout, recharge) unchanged

## Optional route wrapper

```ts
import { withApiObservability } from '@/lib/observability'

export const GET = withApiObservability(async (req) => {
  return Response.json({ ok: true })
}, '/api/example')
```

Automatic HTTP metrics already cover the Node server via instrumentation hooks; the wrapper adds ALS-bound structured access logs.
