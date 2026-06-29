import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'dashboard'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const provider = (url.searchParams.get('provider') ?? 'dtone').trim()

  // Lightweight summary only (avoids huge scans). For deeper analytics, use SQL queries in supabase/aggregator_reporting.sql
  const [plansRes, opsRes, logsRes] = await Promise.all([
    supabaseRest(`agg_plans?provider=eq.${encodeURIComponent(provider)}&select=id,status`, { cache: 'no-store' }),
    supabaseRest(`agg_operators?provider=eq.${encodeURIComponent(provider)}&select=id,country_iso3,status`, { cache: 'no-store' }),
    supabaseRest(`agg_api_logs?provider=eq.${encodeURIComponent(provider)}&select=created_at,status,error&order=created_at.desc&limit=20`, {
      cache: 'no-store',
    }),
  ])

  if (!plansRes.ok || !opsRes.ok || !logsRes.ok) {
    return NextResponse.json({ error: 'Failed to load report data' }, { status: 500 })
  }

  const plans = (await plansRes.json()) as Array<{ status: string }>
  const ops = (await opsRes.json()) as Array<{ country_iso3: string; status: string }>
  const logs = (await logsRes.json()) as Array<{ created_at: string; status: number | null; error: string | null }>

  const plansByStatus = plans.reduce<Record<string, number>>((acc, p) => {
    const k = (p.status || 'unknown').toLowerCase()
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  // Count operators with at least 1 active plan.
  const activePlanOpsRes = await supabaseRest(
    `agg_plans?provider=eq.${encodeURIComponent(provider)}&status=eq.active&select=operator_id`,
    { cache: 'no-store' }
  )
  const activePlanOps = activePlanOpsRes.ok ? ((await activePlanOpsRes.json()) as Array<{ operator_id: string }>) : []
  const activeOperatorIds = new Set(activePlanOps.map((r) => r.operator_id).filter(Boolean))

  const operatorsByCountry = ops.reduce<Record<string, number>>((acc, o) => {
    const k = (o.country_iso3 || 'UNK').toUpperCase()
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    provider,
    summary: {
      plans: { total: plans.length, byStatus: plansByStatus },
      operators: { total: ops.length, withActivePlans: activeOperatorIds.size, byCountryIso3: operatorsByCountry },
    },
    recentApiLogs: logs,
  })
}

