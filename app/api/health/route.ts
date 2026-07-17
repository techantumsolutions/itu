import { NextResponse } from 'next/server'

/** Liveness — process is up. Does not check Redis, Supabase, or Socket.IO. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'web' })
}
