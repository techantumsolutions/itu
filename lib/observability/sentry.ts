/**
 * Sentry bootstrap helpers (lazy — no-op when DSN unset).
 */
import { logger } from '@/lib/observability/logger'
import { getRequestId } from '@/lib/observability/context'

let initialized = false

export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim())
}

export async function initSentryServer(service = 'itu-web'): Promise<void> {
  if (initialized) return
  const dsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (!dsn) {
    logger.info('Sentry disabled (no SENTRY_DSN)')
    return
  }

  const Sentry = await import('@sentry/nextjs')
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'production',
    release: process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || process.env.DEPLOY_SHA,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    sendDefaultPii: false,
    initialScope: {
      tags: { service },
    },
  })
  initialized = true
  logger.info('Sentry initialized', { service })
}

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!isSentryEnabled()) return
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        const requestId = getRequestId()
        if (requestId) scope.setTag('requestId', requestId)
        if (extra) scope.setExtras(extra)
        Sentry.captureException(error)
      })
    })
    .catch(() => {})
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!isSentryEnabled()) return
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        const requestId = getRequestId()
        if (requestId) scope.setTag('requestId', requestId)
        Sentry.captureMessage(message, level)
      })
    })
    .catch(() => {})
}
