import { NextResponse } from 'next/server'
import { blockInProduction } from '@/lib/security/require-secret'

export async function GET() {
  const blocked = blockInProduction()
  if (blocked) return blocked

  return NextResponse.json(
    { error: 'This debug endpoint is disabled. Remove or protect before production.' },
    { status: 404 },
  )
}
