import { NextResponse } from 'next/server'
import { runtimeEnv } from '@/lib/env/runtime'

/** Reject when Bearer secret env is missing in production, or when the header does not match. */
export function requireBearerSecret(
  request: Request,
  envName: string,
  opts?: { missingMessage?: string; unauthorizedMessage?: string },
): NextResponse | null {
  const secret = runtimeEnv(envName)
  const missingMessage = opts?.missingMessage ?? `${envName} is not configured`
  const unauthorizedMessage = opts?.unauthorizedMessage ?? 'Unauthorized'

  if (process.env.NODE_ENV === 'production' && !secret) {
    return NextResponse.json({ error: missingMessage }, { status: 503 })
  }

  if (!secret) return null

  const authHeader = request.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: unauthorizedMessage }, { status: 401 })
  }

  return null
}

/** Reject when header secret env is missing in production, or when the header value does not match. */
export function requireHeaderSecret(
  request: Request,
  envName: string,
  headerName: string,
  opts?: { missingMessage?: string },
): NextResponse | null {
  const secret = runtimeEnv(envName)
  const missingMessage = opts?.missingMessage ?? `${envName} is not configured`

  if (process.env.NODE_ENV === 'production' && !secret) {
    return NextResponse.json({ ok: false, error: missingMessage }, { status: 503 })
  }

  if (!secret) return null

  const provided = request.headers.get(headerName) ?? ''
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  return null
}

/** Block debug/test API routes in production deployments. */
export function blockInProduction(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}
