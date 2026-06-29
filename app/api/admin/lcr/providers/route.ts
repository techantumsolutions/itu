import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { getDtoneCredentialsFromEnv } from '@/lib/dtone'
import { requireAdminPermission, adminHasAnyPermission } from '@/lib/auth/require-admin-feature'
import { logAdminActivity } from '@/lib/auth/audit'

function dingEnvReady(): boolean {
  const a = process.env.DING_API_KEY?.trim()
  const c = process.env.DING_CLIENT_ID?.trim()
  const s = process.env.DING_CLIENT_SECRET?.trim()
  return !!(a || (c && s))
}

type HealthRow = {
  provider_id: string
  success_rate: number | null
  avg_latency_ms: number | null
  captured_at: string
}

type RawFetchRow = { provider_id: string; fetched_at: string }

export async function GET(request: Request) {
  if (
    !(await adminHasAnyPermission(request, ['providers.view', 'lcr.view', 'plans.view']))
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    const dt = getDtoneCredentialsFromEnv()
    return NextResponse.json({
      providers: [],
      catalogLastIngestAt: null as string | null,
      configured: false,
      integration: {
        dtoneEnvReady: !!dt,
        dingEnvReady: dingEnvReady(),
        dtoneUsingDefaultBase: !!dt && !process.env.DTONE_BASE_URL?.trim(),
      },
    })
  }

  try {
    const [provRes, healthRes, globalRes] = await Promise.all([
      supabaseRest(
        'lcr_providers?select=id,code,name,adapter_key,is_active,priority,base_url,refresh_interval_minutes,status,supported_countries,last_sync_at,last_success_sync_at,created_at,updated_at&order=priority.asc',
        { cache: 'no-store' },
      ),
      supabaseRest(
        'provider_health_metrics?select=provider_id,success_rate,avg_latency_ms,captured_at&order=captured_at.desc&limit=400',
        { cache: 'no-store' },
      ).catch(() => null as Response | null),
      supabaseRest('provider_plans_raw?select=fetched_at&order=fetched_at.desc&limit=1', { cache: 'no-store' }).catch(
        () => null as Response | null,
      ),
    ])

    if (!provRes.ok) return NextResponse.json({ error: 'Failed to load providers' }, { status: 500 })
    const providers = (await provRes.json()) as Record<string, unknown>[]

    let catalogLastIngestAt: string | null = null
    if (globalRes?.ok) {
      const g = (await globalRes.json()) as { fetched_at?: string }[]
      catalogLastIngestAt = g?.[0]?.fetched_at ?? null
    }

    const healthMap = new Map<string, { success_rate: number | null; avg_latency_ms: number | null; captured_at: string }>()
    if (healthRes?.ok) {
      const healthRows = (await healthRes.json()) as HealthRow[]
      for (const h of healthRows) {
        if (!healthMap.has(h.provider_id)) {
          healthMap.set(h.provider_id, {
            success_rate: h.success_rate,
            avg_latency_ms: h.avg_latency_ms,
            captured_at: h.captured_at,
          })
        }
      }
    }

    // Query the latest fetched_at for each provider in parallel
    const latestIngests = await Promise.all(
      providers.map(async (p) => {
        try {
          const res = await supabaseRest(
            `provider_plans_raw?provider_id=eq.${p.id}&select=fetched_at&order=fetched_at.desc&limit=1`,
            { cache: 'no-store' }
          )
          if (res.ok) {
            const rows = await res.json() as any[]
            return { providerId: String(p.id), fetchedAt: rows?.[0]?.fetched_at || null }
          }
        } catch (err) {
          console.error(`Failed to fetch latest ingest date for provider ${p.code}:`, err)
        }
        return { providerId: String(p.id), fetchedAt: null }
      })
    )

    const ingestMap = new Map<string, string>()
    for (const item of latestIngests) {
      if (item.fetchedAt) {
        ingestMap.set(item.providerId, item.fetchedAt)
      }
    }

    const merged = providers.map((p) => {
      const id = String(p.id)
      const h = healthMap.get(id)
      const lastIngest = p.last_success_sync_at || p.last_sync_at || ingestMap.get(id) || null
      return {
        ...p,
        success_rate: h?.success_rate ?? null,
        avg_latency_ms: h?.avg_latency_ms ?? null,
        last_health_check: h?.captured_at ?? null,
        last_plan_ingest_at: lastIngest,
      }
    })

    const dt = getDtoneCredentialsFromEnv()
    const integration = {
      dtoneEnvReady: !!dt,
      dingEnvReady: dingEnvReady(),
      dtoneUsingDefaultBase: !!dt && !process.env.DTONE_BASE_URL?.trim(),
    }

    return NextResponse.json({
      providers: merged,
      catalogLastIngestAt,
      configured: true,
      integration,
    })
  } catch {
    const dt = getDtoneCredentialsFromEnv()
    return NextResponse.json({
      providers: [],
      catalogLastIngestAt: null,
      configured: true,
      integration: {
        dtoneEnvReady: !!dt,
        dingEnvReady: dingEnvReady(),
        dtoneUsingDefaultBase: !!dt && !process.env.DTONE_BASE_URL?.trim(),
      },
    })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'providers.create')
  if (denied) return denied
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const actor = getRequestUser(request)

  const body = await request.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const adapterKey = typeof body.adapterKey === 'string' ? body.adapterKey.trim().toLowerCase() : ''
  if (!code || !name || !adapterKey) return NextResponse.json({ error: 'code, name, adapterKey are required' }, { status: 400 })

  let credentialsEncrypted: string | null = null
  if (typeof body.credentialsEncrypted === 'string') credentialsEncrypted = body.credentialsEncrypted
  else if (body.credentials && typeof body.credentials === 'object') {
    credentialsEncrypted = JSON.stringify(body.credentials)
  }

  const res = await supabaseRest('lcr_providers', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      code,
      name,
      adapter_key: adapterKey,
      is_active: body.isActive ?? true,
      priority: body.priority ?? 100,
      base_url: body.baseUrl ?? null,
      refresh_interval_minutes: body.refreshIntervalMinutes ?? 60,
      supported_countries: Array.isArray(body.supportedCountries) ? body.supportedCountries : [],
      credentials_encrypted: credentialsEncrypted,
    }),
  })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })

  await supabaseRest('lcr_audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      actor: actor?.email ?? 'admin',
      action: 'provider.create',
      entity_type: 'lcr_provider',
      entity_id: code,
      details: { code, adapterKey },
    }),
  }).catch(() => {})

  await logAdminActivity({
    action: 'Create Provider',
    pageName: 'Providers',
    details: { code, name, adapterKey },
  })

  const rows = (await res.json()) as any[]
  return NextResponse.json({ provider: rows?.[0] ?? null }, { status: 201 })
}
