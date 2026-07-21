'use client'

import { useEffect } from 'react'

/**
 * Initializes browser Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
 * No-op otherwise — does not affect UI or business logic.
 */
export function SentryClientInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
    if (!dsn) return
    void import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
        release: process.env.NEXT_PUBLIC_APP_VERSION,
        tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
        sendDefaultPii: false,
      })
    })
  }, [])
  return null
}
