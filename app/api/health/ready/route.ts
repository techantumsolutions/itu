import { NextResponse } from 'next/server'
import { checkWebReadiness } from '@/lib/health/runtime-checks'

/**
 * Readiness — Redis + Supabase connectivity only.
 * Socket.IO is intentionally excluded so the app can serve traffic when
 * live ticket notifications are temporarily unavailable.
 */
export async function GET() {
  const result = await checkWebReadiness()
  const status = result.ok ? 200 : 503
  return NextResponse.json(
    {
      ok: result.ok,
      service: 'web',
      checks: {
        redis: result.redis,
        supabase: result.supabase,
      },
    },
    { status },
  )
}
