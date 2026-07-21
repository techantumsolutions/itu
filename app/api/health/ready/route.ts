import { NextResponse } from 'next/server'
import { checkWebReadiness } from '@/lib/health/runtime-checks'

/**
 * Readiness — Redis + Supabase connectivity only.
 * Socket.IO is intentionally excluded so the app can serve traffic when
 * live ticket notifications are temporarily unavailable.
 *
 * Dependency details never include secrets (URLs/keys are omitted).
 */
export async function GET() {
  const result = await checkWebReadiness()
  const status = result.ok ? 200 : 503
  return NextResponse.json(
    {
      ok: result.ok,
      service: 'web',
      status: result.ok ? 'ready' : 'not_ready',
      version: process.env.APP_VERSION || process.env.DEPLOY_SHA || null,
      environment: process.env.APP_ENV || process.env.NODE_ENV || null,
      timestamp: new Date().toISOString(),
      checks: {
        redis: {
          ok: result.redis.ok,
          // Sanitize: never echo connection strings / passwords
          detail: result.redis.ok ? 'up' : sanitizeDetail(result.redis.detail),
        },
        database: {
          ok: result.supabase.ok,
          detail: result.supabase.ok ? 'up' : sanitizeDetail(result.supabase.detail),
        },
      },
    },
    { status },
  )
}

function sanitizeDetail(detail?: string): string {
  if (!detail) return 'down'
  const lower = detail.toLowerCase()
  if (lower.includes('password') || lower.includes('redis://') || lower.includes('postgres://')) {
    return 'unreachable'
  }
  if (lower.includes('missing')) return 'misconfigured'
  if (lower.includes('timeout')) return 'timeout'
  if (lower.includes('status=')) return detail.replace(/https?:\/\/[^\s]+/gi, '[redacted]')
  return detail.slice(0, 80)
}
