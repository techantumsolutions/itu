import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { ingestProviderPlans } from '@/lib/uti/ingestion'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
  if (!providerId) return NextResponse.json({ error: 'providerId is required' }, { status: 400 })

  const res = await supabaseRest(
    `lcr_providers?id=eq.${encodeURIComponent(providerId)}&select=id,code,name,adapter_key,is_active,priority,refresh_interval_minutes,supported_countries,base_url,credentials_encrypted&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to load provider' }, { status: 500 })
  const rows = (await res.json()) as any[]
  const p = rows?.[0]
  if (!p) return NextResponse.json({ error: 'provider_not_found' }, { status: 404 })

  const cfg = rowToProviderConfig(p)
  const result = await ingestProviderPlans(cfg)

  return NextResponse.json({ success: true, result })
}

