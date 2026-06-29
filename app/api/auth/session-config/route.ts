import { NextResponse } from 'next/server'
import { getSessionIdleTimeoutMinutes, getSessionIdleTimeoutMs } from '@/lib/auth/session-idle-config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const idleTimeoutMinutes = getSessionIdleTimeoutMinutes()
  return NextResponse.json({
    ok: true,
    idleTimeoutMinutes,
    idleTimeoutMs: getSessionIdleTimeoutMs(),
  })
}
