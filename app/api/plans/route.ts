import { NextResponse } from 'next/server'
import { dbFetchOperators, dbFetchPlans, type PlanRow } from '@/lib/db/catalog'
import { dbListAggPlans } from '@/lib/db/agg-catalog'
import { guardCatalog } from '@/lib/db/require-catalog'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function mapPlanType(raw: string | null | undefined): 'topup' | 'unlimited' | 'data' {
  const t = (raw ?? 'topup').toLowerCase()
  if (t === 'data') return 'data'
  if (t === 'voice' || t === 'unlimited' || t === 'combo') return 'unlimited'
  return 'topup'
}

function rowToPlan(p: PlanRow) {
  const tag = p.tag === 'popular' ? ('popular' as const) : ('none' as const)
  return {
    id: p.sku_code,
    price_inr: Math.round(num(p.price_inr)),
    price_eur: Number(num(p.price_eur).toFixed(2)),
    validity: p.validity ?? '',
    data: p.data_label ?? undefined,
    calls: p.calls_label ?? undefined,
    sms: p.sms_label ?? undefined,
    benefits: p.benefits ?? '',
    tag,
    type: mapPlanType(p.plan_type),
    planName: p.plan_name ?? undefined,
  }
}

export async function GET(request: Request) {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const source = (searchParams.get('source') ?? '').trim().toLowerCase()

    // Additive: allow serving aggregator-synced plans from normalized tables.
    // Default behavior (no `source`) remains unchanged for backward compatibility.
    if (source === 'agg' || source === 'aggregator' || source === 'dtone') {
      const countryIso3 = (searchParams.get('countryIso3') ?? '').trim().toUpperCase()
      const operatorId = (searchParams.get('operatorId') ?? '').trim()
      const tag = (searchParams.get('tag') ?? '').trim()
      const limit = Number(searchParams.get('limit') ?? '50')
      const offset = Number(searchParams.get('offset') ?? '0')
      const minRetail = searchParams.get('minRetail') != null ? Number(searchParams.get('minRetail')) : undefined
      const maxRetail = searchParams.get('maxRetail') != null ? Number(searchParams.get('maxRetail')) : undefined

      const rows = await dbListAggPlans({
        provider: 'dtone',
        countryIso3: countryIso3 || undefined,
        operatorId: operatorId || undefined,
        tag: tag || undefined,
        minRetail: Number.isFinite(minRetail as number) ? (minRetail as number) : undefined,
        maxRetail: Number.isFinite(maxRetail as number) ? (maxRetail as number) : undefined,
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
        status: 'active',
      })

      return NextResponse.json({
        source: 'aggregator',
        plans: rows,
        pagination: { limit: Number.isFinite(limit) ? limit : 50, offset: Number.isFinite(offset) ? offset : 0, returned: rows.length },
      })
    }

    const operatorRaw = (searchParams.get('operator') ?? '').trim()
    const operatorLc = operatorRaw.toLowerCase()
    const providerCodeHint = (searchParams.get('providerCode') ?? '').trim()
    const country = (searchParams.get('country') ?? 'IN').trim().toUpperCase()

    if (!operatorLc && !providerCodeHint) {
      return NextResponse.json({ error: 'operator or providerCode is required' }, { status: 400 })
    }

    let code = providerCodeHint || null
    if (!code && operatorLc) {
      const operators = await dbFetchOperators(country)
      const matched =
        operators.find((p) => p.code.toLowerCase() === operatorLc) ||
        operators.find((p) => (p.short_name ?? '').toLowerCase().includes(operatorLc)) ||
        operators.find((p) => (p.name ?? '').toLowerCase().includes(operatorLc))
      code = matched?.code ?? null
    }

    // When the UI shows "Unknown" or names don't match DB codes, still return plans for the country.
    const cacheKey = `catalog:plans:${country}:${code ?? 'ALL'}`
    const cached = await cacheGetJson<PlanRow[]>(cacheKey)
    const rows = cached ?? (await dbFetchPlans(country, code))
    if (!cached && rows.length) await cacheSetJson(cacheKey, rows, 300)
    return NextResponse.json({ plans: rows.map(rowToPlan) })
  } catch (error) {
    console.error('plans:', error)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
