import { NextResponse } from 'next/server'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { ingestProviderPlans } from '@/lib/uti/ingestion'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const configuredSecret = process.env.CRON_SECRET
  if (configuredSecret && authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 })
  }

  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const res = await supabaseRest(
    'lcr_providers?is_active=eq.true&select=id,code,name,adapter_key,is_active,priority,refresh_interval_minutes,supported_countries,base_url,credentials_encrypted',
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const rows = (await res.json()) as any[]

  const results: unknown[] = []
  for (const p of rows) {
    const cfg = rowToProviderConfig(p)
    try {
      const r = await ingestProviderPlans(cfg)
      results.push({ providerId: p.id, ok: true, result: r })
    } catch (e) {
      results.push({ providerId: p.id, ok: false, error: e instanceof Error ? e.message : 'sync_failed' })
    }
  }

  return NextResponse.json({ success: true, providers: rows.length, results })
}
