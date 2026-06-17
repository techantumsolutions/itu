import { NextResponse } from 'next/server'
import { isAdminRequest, getRequestUser } from '@/lib/tickets/auth-headers'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { getDtoneCredentialsFromEnv } from '@/lib/dtone'
import { getValuetopupCredentialsFromEnv } from '@/lib/valuetopup'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { logAdminActivity } from '@/lib/auth/audit'

function readEnv(name: string): string | undefined {
  const v = process.env[name]
  return v?.trim() || undefined
}

function dingEnvConfigured(): boolean {
  return !!(readEnv('DING_API_KEY') || (readEnv('DING_CLIENT_ID') && readEnv('DING_CLIENT_SECRET')))
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const actor = getRequestUser(request)
  const created: string[] = []
  const errors: { code: string; detail: string }[] = []

  const listRes = await supabaseRest('lcr_providers?select=code', { cache: 'no-store' })
  if (!listRes.ok) return NextResponse.json({ error: await listRes.text() }, { status: 500 })
  const existing = new Set(((await listRes.json()) as { code: string }[]).map((r) => r.code.toUpperCase()))

  const dtone = getDtoneCredentialsFromEnv()
  if (dtone && !existing.has('DTONE')) {
    const res = await supabaseRest('lcr_providers', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        code: 'DTONE',
        name: 'DT One',
        adapter_key: 'dtone',
        is_active: true,
        priority: 10,
        base_url: dtone.baseUrl,
        refresh_interval_minutes: 120,
        supported_countries: [],
        credentials_encrypted: JSON.stringify({ source: 'env' }),
      }),
    })
    if (res.ok) {
      created.push('DTONE')
      existing.add('DTONE')
    } else {
      errors.push({ code: 'DTONE', detail: (await res.text()).slice(0, 500) })
    }
  }

  const valuetopup = getValuetopupCredentialsFromEnv()
  if (valuetopup && !existing.has('VALUETOPUP')) {
    const res = await supabaseRest('lcr_providers', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        code: 'VALUETOPUP',
        name: 'Value Topup',
        adapter_key: 'valuetopup',
        is_active: true,
        priority: 30,
        base_url: valuetopup.baseUrl,
        refresh_interval_minutes: 60,
        supported_countries: ['MYS'],
        credentials_encrypted: JSON.stringify({ source: 'env' }),
      }),
    })
    if (res.ok) {
      created.push('VALUETOPUP')
      existing.add('VALUETOPUP')
    } else {
      errors.push({ code: 'VALUETOPUP', detail: (await res.text()).slice(0, 500) })
    }
  }

  if (dingEnvConfigured() && !existing.has('DING')) {
    const baseUrl = readEnv('DING_API_BASE_URL') || 'https://api.dingconnect.com'
    const res = await supabaseRest('lcr_providers', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        code: 'DING',
        name: 'Ding Connect',
        adapter_key: 'ding',
        is_active: true,
        priority: 20,
        base_url: baseUrl,
        refresh_interval_minutes: 60,
        supported_countries: [],
        credentials_encrypted: JSON.stringify({ source: 'env' }),
      }),
    })
    if (res.ok) {
      created.push('DING')
    } else {
      errors.push({ code: 'DING', detail: (await res.text()).slice(0, 500) })
    }
  }

  await supabaseRest('lcr_audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      actor: actor?.email ?? 'admin',
      action: 'provider.bootstrap_env',
      entity_type: 'lcr_provider',
      entity_id: 'bootstrap',
      details: { created, errors },
    }),
  }).catch(() => {})

  await logAdminActivity({
    action: 'Bootstrap Environment Providers',
    pageName: 'System',
    details: { created, errors },
  })

  return NextResponse.json({
    created,
    errors,
    dtoneEnvDetected: !!dtone,
    valuetopupEnvDetected: !!valuetopup,
    dingEnvDetected: dingEnvConfigured(),
  })
}
