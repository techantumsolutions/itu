import { NextResponse } from 'next/server'

// Backward-compatible alias for "providers" (operators/carriers).
// Does not change existing /api/providers behavior.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const countryCode = url.searchParams.get('countryCode')
  if (!countryCode) {
    return NextResponse.json({ error: 'Country code is required' }, { status: 400 })
  }

  // Reuse existing route internally to avoid logic divergence.
  const res = await fetch(`${url.origin}/api/providers?countryCode=${encodeURIComponent(countryCode)}`, {
    headers: request.headers,
    cache: 'no-store',
  })

  const json = await res.json().catch(() => ({}))
  return NextResponse.json(json, { status: res.status })
}

