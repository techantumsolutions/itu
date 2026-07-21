/**
 * Optional route wrapper — records duration/logs without changing handler results.
 * Prefer automatic HTTP hooks (instrumentation) for coverage; use this for explicit ALS binding.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  defaultServiceName,
  resolveRequestId,
  runWithObsContextAsync,
  REQUEST_ID_HEADER,
  updateObsContext,
} from '@/lib/observability/context'
import { logger } from '@/lib/observability/logger'
import { recordHttpRequest } from '@/lib/observability/metrics'
import { captureException } from '@/lib/observability/sentry'

type Handler = (req: NextRequest, ctx?: unknown) => Promise<Response> | Response

export function withApiObservability(handler: Handler, routeHint?: string): Handler {
  return async (req, ctx) => {
    const incoming = req.headers.get(REQUEST_ID_HEADER)
    const requestId = resolveRequestId(incoming)
    const route = routeHint || req.nextUrl.pathname
    const start = Date.now()

    return runWithObsContextAsync(
      {
        requestId,
        route,
        service: defaultServiceName(),
      },
      async () => {
        try {
          const userId = req.headers.get('x-user-id')?.trim()
          if (userId) updateObsContext({ userId })

          const res = await handler(req, ctx)
          const duration = Date.now() - start
          const status = res.status
          recordHttpRequest({
            method: req.method,
            route,
            status,
            durationSeconds: duration / 1000,
          })
          logger.info('http_request', {
            method: req.method,
            route,
            status,
            duration,
          })

          const headers = new Headers(res.headers)
          headers.set(REQUEST_ID_HEADER, requestId)
          return new NextResponse(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers,
          })
        } catch (error) {
          const duration = Date.now() - start
          logger.error('http_request_error', {
            method: req.method,
            route,
            duration,
            err: error,
          })
          captureException(error, { route, method: req.method })
          recordHttpRequest({
            method: req.method,
            route,
            status: 500,
            durationSeconds: duration / 1000,
          })
          throw error
        }
      },
    )
  }
}
