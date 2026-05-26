import { NextResponse } from 'next/server'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { enqueueProviderSync, getProviderSyncQueue } from '@/lib/jobs/queue'
import { syncProviderCatalog } from '@/lib/lcr/sync-catalog'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const configuredSecret = process.env.CRON_SECRET
  if (configuredSecret && authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 })
  }

  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const res = await supabaseRest('lcr_providers?is_active=eq.true&select=id,code', { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const rows = (await res.json()) as any[]

  const results: unknown[] = []
  const q = getProviderSyncQueue()
  for (const p of rows) {
    try {
      if (q) {
        const job = await enqueueProviderSync(p.id)
        results.push({ providerId: p.id, ok: true, queued: true, jobId: job?.id ?? null })
      } else {
        const r = await syncProviderCatalog(p.id)
        results.push({ providerId: p.id, ok: true, queued: false, result: r })
      }
    } catch (e) {
      results.push({ providerId: p.id, ok: false, error: e instanceof Error ? e.message : 'sync_failed' })
    }
  }

  return NextResponse.json({ success: true, providers: rows.length, results })
}
