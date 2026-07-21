import { NextResponse } from 'next/server'
import { renderPrometheusMetrics, prometheusContentType } from '@/lib/observability/metrics'
import { logger } from '@/lib/observability/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Prometheus scrape endpoint.
 * Protect with METRICS_TOKEN (Authorization: Bearer <token> or ?token=).
 * If METRICS_TOKEN is unset, only allow from loopback (local scrapes / sidecar).
 */
function authorize(req: Request): boolean {
  const configured = process.env.METRICS_TOKEN?.trim()
  const header = req.headers.get('authorization')?.trim() || ''
  const url = new URL(req.url)
  const q = url.searchParams.get('token')?.trim() || ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''

  if (configured) {
    return bearer === configured || q === configured
  }

  // No token configured: restrict to local scrapers
  const host = req.headers.get('host') || ''
  const fwd = req.headers.get('x-forwarded-for') || ''
  if (fwd && !fwd.split(',')[0]?.trim().match(/^(127\.|::1|localhost)/i)) return false
  return host.startsWith('127.') || host.startsWith('localhost') || host.startsWith('[::1]')
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    const body = await renderPrometheusMetrics()
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': prometheusContentType(),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('metrics_render_failed', { err: error })
    return NextResponse.json({ ok: false, error: 'metrics_unavailable' }, { status: 500 })
  }
}
