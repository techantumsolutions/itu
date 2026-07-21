/**
 * Run: REDIS_URL=redis://localhost:6379 npx tsx scripts/lcr-sync-worker.ts
 * Processes BullMQ jobs from queue "provider-sync".
 * Production: set REDIS_PASSWORD or embed password in REDIS_URL.
 */
import { Worker } from 'bullmq'
import { syncProviderCatalog } from '@/lib/lcr/sync-catalog'
import { validateCountriesTable } from '@/lib/aggregator/country-startup-validation'
import { buildBullMqConnection } from '@/lib/cache/redis-connection'
import {
  PROVIDER_SYNC_LOCK_MS,
  PROVIDER_SYNC_MAX_STALLED,
  PROVIDER_SYNC_STALLED_INTERVAL_MS,
} from '@/lib/jobs/queue'
import {
  defaultServiceName,
  newRequestId,
  runWithObsContextAsync,
} from '@/lib/observability/context'
import { logger, installConsoleBridge } from '@/lib/observability/logger'
import { captureException, initSentryServer } from '@/lib/observability/sentry'

type JobPayload = { providerId: string; requestId?: string }

async function main() {
  installConsoleBridge()
  await initSentryServer('itu-worker')

  let connection: ReturnType<typeof buildBullMqConnection>
  try {
    connection = buildBullMqConnection()
  } catch (error) {
    logger.error('worker_redis_config_invalid', { err: error })
    process.exit(1)
  }
  if (!connection) {
    logger.error('REDIS_URL is required')
    process.exit(1)
  }

  await validateCountriesTable().catch((error) => {
    logger.error('countries_table_validation_failed', { err: error })
    process.exit(1)
  })

  logger.info('lcr_sync_worker_starting', {
    lockDurationMs: PROVIDER_SYNC_LOCK_MS,
    stalledIntervalMs: PROVIDER_SYNC_STALLED_INTERVAL_MS,
  })

  const worker = new Worker<JobPayload>(
    'provider-sync',
    async (job) => {
      const requestId = job.data.requestId || newRequestId()
      return runWithObsContextAsync(
        {
          requestId,
          service: defaultServiceName() === 'itu-web' ? 'itu-worker' : defaultServiceName(),
          jobName: job.name,
          jobId: String(job.id ?? ''),
          route: `bullmq:provider-sync:${job.name}`,
        },
        async () => {
          logger.info('job_started', { providerId: job.data.providerId })
          try {
            // BullMQ renews the lock while the processor is running when lockDuration is set.
            const result = await syncProviderCatalog(job.data.providerId)
            logger.info('job_completed', { providerId: job.data.providerId })
            return result
          } catch (error) {
            logger.error('job_failed', { providerId: job.data.providerId, err: error })
            captureException(error, { jobId: String(job.id ?? ''), providerId: job.data.providerId })
            throw error
          }
        },
      )
    },
    {
      ...connection,
      concurrency: 1,
      lockDuration: PROVIDER_SYNC_LOCK_MS,
      stalledInterval: PROVIDER_SYNC_STALLED_INTERVAL_MS,
      maxStalledCount: PROVIDER_SYNC_MAX_STALLED,
    } as any,
  )

  worker.on('completed', (job) => {
    logger.info('worker_job_completed', { jobId: job.id })
  })
  worker.on('failed', (job, err) => {
    logger.error('worker_job_failed_event', { jobId: job?.id, err })
    captureException(err, { jobId: job?.id })
  })

  let shuttingDown = false

  async function shutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('worker_shutdown_begin', { signal })
    try {
      await worker.close()
      logger.info('worker_shutdown_complete')
      process.exit(0)
    } catch (error) {
      logger.error('worker_shutdown_error', { err: error })
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.on('uncaughtException', (error) => {
    logger.error('uncaught_exception', { err: error })
    captureException(error)
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled_rejection', {
      err: reason instanceof Error ? reason : new Error(String(reason)),
    })
    captureException(reason)
  })
}

void main()
