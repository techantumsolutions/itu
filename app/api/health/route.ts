import { NextResponse } from 'next/server'

/** Liveness — process is up. Does not check Redis, Supabase, or Socket.IO. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'web',
    status: 'alive',
    version: process.env.APP_VERSION || process.env.DEPLOY_SHA || null,
    environment: process.env.APP_ENV || process.env.NODE_ENV || null,
    timestamp: new Date().toISOString(),
  })
}
