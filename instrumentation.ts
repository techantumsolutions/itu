/**
 * Next.js instrumentation — observability bootstrap (Node runtime).
 * Does not change business logic; installs logging/metrics/Sentry hooks.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('node:dns')
    dns.setDefaultResultOrder('ipv4first')

    await import('@/lib/observability/context-node')

    const { installConsoleBridge } = await import('@/lib/observability/logger')
    const { installHttpMetricsHooks } = await import('@/lib/observability/metrics')
    const { initSentryServer } = await import('@/lib/observability/sentry')
    const { logger } = await import('@/lib/observability/logger')

    installConsoleBridge()
    installHttpMetricsHooks()
    await initSentryServer('itu-web')

    const { validateCountriesTable } = await import('@/lib/aggregator/country-startup-validation')
    await validateCountriesTable().catch((error) => {
      logger.error('countries_table_validation_failed', { err: error })
    })

    process.on('uncaughtException', (error) => {
      logger.error('uncaught_exception', { err: error })
      void import('@/lib/observability/sentry').then(({ captureException }) => captureException(error))
    })
    process.on('unhandledRejection', (reason) => {
      logger.error('unhandled_rejection', { err: reason instanceof Error ? reason : new Error(String(reason)) })
      void import('@/lib/observability/sentry').then(({ captureException }) => captureException(reason))
    })
  }
}

export async function onRequestError(
  error: { digest?: string } & Error,
  request: {
    path: string
    method: string
    headers: { get(name: string): string | null }
  },
) {
  const { logger } = await import('@/lib/observability/logger')
  const { captureException } = await import('@/lib/observability/sentry')
  const requestId = request.headers.get('x-request-id') || undefined
  logger.error('next_request_error', {
    route: request.path,
    method: request.method,
    requestId,
    digest: error.digest,
    err: error,
  })
  captureException(error, {
    route: request.path,
    method: request.method,
    requestId,
    digest: error.digest,
  })
}
