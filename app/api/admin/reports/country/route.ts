import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { resolveDateRange, getDefaultDateRange } from '@/lib/reports/date-range'
import type { DateRangePreset } from '@/lib/reports/types'
import {
  createReportFxConverter,
  resolveProviderCostAmount,
  resolveProviderCostCurrency,
} from '@/lib/reports/fx'

// Simple TTL cache (60s) to avoid redundant DB round-trips
const _cache = new Map<string, { ts: number; data: unknown }>()
const TTL = 60_000
function cacheGet(k: string): unknown | null {
  const h = _cache.get(k)
  if (!h) return null
  if (Date.now() - h.ts > TTL) { _cache.delete(k); return null }
  return h.data
}
function cacheSet(k: string, d: unknown) { _cache.set(k, { ts: Date.now(), data: d }) }

function n(v: unknown): number { const x = Number(v); return Number.isFinite(x) ? x : 0 }
function pct(a: number, b: number) { return b > 0 ? parseFloat(((a / b) * 100).toFixed(1)) : 0 }

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🏳️'
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0))
  try {
    return String.fromCodePoint(...codePoints)
  } catch {
    return '🏳️'
  }
}

function getCountryCurrency(iso2: string): string {
  const map: Record<string, string> = {
    IN: 'INR', US: 'USD', GB: 'GBP', CA: 'CAD', MX: 'MXN', FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR',
    BD: 'BDT', PK: 'PKR', NP: 'NPR', LK: 'LKR', PH: 'PHP', VN: 'VND', ID: 'IDR', MY: 'MYR', TH: 'THB',
    NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', EG: 'EGP', MA: 'MAD', BR: 'BRL', AR: 'ARS', CO: 'COP',
    VE: 'VES', PE: 'PEN', CL: 'CLP', BO: 'BOB', TR: 'TRY', UA: 'UAH', PL: 'PLN', RO: 'RON', BG: 'BGN',
  }
  return map[iso2.toUpperCase()] ?? 'USD'
}

async function fetchAll<T = Record<string, unknown>>(path: string, ps = 2000): Promise<T[]> {
  const rows: T[] = []
  let off = 0
  for (;;) {
    const sep = path.includes('?') ? '&' : '?'
    const res = await supabaseRest(`${path}${sep}limit=${ps}&offset=${off}`)
    if (!res.ok) throw new Error(`[country-report] ${path}: ${await res.text().catch(() => res.statusText)}`)
    const page = (await res.json()) as T[]
    rows.push(...page)
    if (page.length < ps) break
    off += ps
  }
  return rows
}

function dateFilters(from?: string, to?: string) {
  const parts: string[] = []
  if (from) parts.push(`created_at=gte.${from}T00:00:00Z`)
  if (to)   parts.push(`created_at=lte.${to}T23:59:59Z`)
  return parts.join('&')
}

function granularity(from?: string, to?: string): 'hour' | 'day' | 'month' {
  if (!from || !to) return 'month'
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
  if (days <= 2) return 'hour'
  if (days <= 62) return 'day'
  return 'month'
}

/** Normalize ISO2 / ISO3 / unknown country codes to ISO2 using the countries table maps. */
function toIso2(
  raw: unknown,
  iso3to2: Map<string, string>,
  iso2Set: Set<string>,
): string | null {
  const code = String(raw ?? '').toUpperCase().trim()
  if (!code || code === 'UNKNOWN' || code === 'UNK') return null
  if (code.length === 2) return iso2Set.has(code) ? code : code
  if (code.length === 3) return iso3to2.get(code) ?? null
  return iso3to2.get(code) ?? (iso2Set.has(code) ? code : null)
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function POST(request: Request) {
  if (!(await adminCanUseFeature(request, 'reports'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    reportType?: string
    filters?: {
      dateRange?: { from?: string; to?: string; preset?: string }
      search?: string
      country?: string
      destinationCountry?: string
      originCountry?: string
    }
    page?: number; pageSize?: number
    sort?: { column: string; direction: 'asc' | 'desc' }
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const isOrigin = body.reportType === 'origin_country'
  const dr = body.filters?.dateRange
  const resolved = dr?.preset
    ? resolveDateRange(dr.preset as DateRangePreset, dr.from, dr.to)
    : (dr?.from && dr?.to ? { from: dr.from, to: dr.to } : getDefaultDateRange())

  const { from, to } = resolved
  const search   = (body.filters?.search ?? '').toLowerCase().trim()
  const pageNum  = Math.max(1, body.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, body.pageSize ?? 50))
  const countryFilter = (
    (isOrigin ? body.filters?.originCountry : body.filters?.destinationCountry) ??
    body.filters?.country ??
    ''
  ).toUpperCase().trim()

  const cacheKey = `country:${body.reportType ?? 'destination_country'}:${from}:${to}:${search}:${countryFilter}:${pageNum}:${pageSize}:${body.sort?.column}:${body.sort?.direction}`
  const cached = cacheGet(cacheKey)
  if (cached) return NextResponse.json(cached)

  const df = dateFilters(from, to)
  const txFilter = `${df ? `&${df}` : ''}&status=neq.pending_payment`

  // ── Parallel master-table queries ────────────────────────────────────────
  const [countries, operators, plans, profiles, planMappings, operatorMappings, systemPlans] = await Promise.all([
    fetchAll<{ id: string; name: string; iso2: string; iso3: string; dial_prefix: string | null }>(
      'countries?select=id,name,iso2,iso3,dial_prefix&order=name.asc', 1000),
    fetchAll<{ id: string; country_id: string; status: string | null }>(
      'system_operators?select=id,country_id,status', 5000),
    fetchAll<{ id: string; country_iso3: string; active: boolean }>(
      'internal_plans?select=id,country_iso3,active', 5000),
    fetchAll<{ country: string | null }>(
      'profiles?select=country', 10000),
    fetchAll<{ system_plan_id: string; service_provider_id: string; country_code: string | null }>(
      'plan_mappings?select=system_plan_id,service_provider_id,country_code', 20000),
    fetchAll<{ system_operator_id: string; service_provider_id: string }>(
      'operator_mappings?select=system_operator_id,service_provider_id', 20000),
    fetchAll<{ id: string; system_operator_id: string; country_code: string | null; status: string | null }>(
      'system_plans?select=id,system_operator_id,country_code,status', 20000),
  ])

  // ── Transactions with recharge_orders (+ profiles for origin) ────────────
  const txSelect = isOrigin
    ? 'id,status,amount,currency,created_at,metadata,user_id,profiles(country),recharge_orders(country_iso,operator_name,provider,send_amount,send_currency,metadata)'
    : 'id,status,amount,currency,created_at,metadata,recharge_orders(country_iso,operator_name,provider,send_amount,send_currency,metadata)'

  const transactions = await fetchAll<{
    id: string; status: string; amount: number | null; currency?: string | null; created_at: string
    metadata: Record<string, unknown> | null
    user_id?: string | null
    profiles?: { country: string | null } | { country: string | null }[] | null
    recharge_orders: Array<{ country_iso: string | null; operator_name: string | null; provider: string | null; send_amount: number | null; send_currency?: string | null; metadata: Record<string, unknown> | null }> | null
  }>(
    `transactions?select=${txSelect}&type=eq.recharge${txFilter}`,
    5000,
  )

  // Map ISO3 ↔ ISO2 (needed before operator/provider grouping)
  const iso3to2 = new Map(
    countries
      .filter((c) => c.iso3 && c.iso2)
      .map((c) => [c.iso3.toUpperCase(), c.iso2.toUpperCase()] as const),
  )
  const iso2Set = new Set(countries.map((c) => c.iso2.toUpperCase()).filter(Boolean))

  // ── Operators by country (system_operators.country_id is typically ISO3) ──
  const opsByIso2 = new Map<string, number>()
  const operatorIdsByIso2 = new Map<string, Set<string>>()
  for (const op of operators) {
    const status = (op.status ?? '').toUpperCase()
    if (status && status !== 'ACTIVE') continue
    const iso2 = toIso2(op.country_id, iso3to2, iso2Set)
    if (!iso2) continue
    opsByIso2.set(iso2, (opsByIso2.get(iso2) ?? 0) + 1)
    if (!operatorIdsByIso2.has(iso2)) operatorIdsByIso2.set(iso2, new Set())
    operatorIdsByIso2.get(iso2)!.add(op.id)
  }

  // ── Providers by country via operator_mappings + plan_mappings ────────────
  const providersByIso2 = new Map<string, Set<string>>()

  const addProvider = (iso2: string | null, providerId: string | null | undefined) => {
    const pid = String(providerId ?? '').trim()
    if (!iso2 || !pid) return
    if (!providersByIso2.has(iso2)) providersByIso2.set(iso2, new Set())
    providersByIso2.get(iso2)!.add(pid)
  }

  // operator_mappings → system operator → country
  const operatorCountryIso2 = new Map<string, string>()
  for (const [iso2, ids] of operatorIdsByIso2) {
    for (const id of ids) operatorCountryIso2.set(id, iso2)
  }
  // Also include inactive operators so mappings still resolve to a country
  for (const op of operators) {
    if (operatorCountryIso2.has(op.id)) continue
    const iso2 = toIso2(op.country_id, iso3to2, iso2Set)
    if (iso2) operatorCountryIso2.set(op.id, iso2)
  }

  for (const m of operatorMappings) {
    const iso2 = operatorCountryIso2.get(m.system_operator_id)
    addProvider(iso2 ?? null, m.service_provider_id)
  }

  // system_plans → plan_mappings (most reliable when country_code on mapping is null)
  const planToOperator = new Map<string, string>()
  const planCountryIso2 = new Map<string, string>()
  for (const plan of systemPlans) {
    const planId = String(plan.id ?? '').trim()
    if (!planId) continue
    if (plan.system_operator_id) planToOperator.set(planId, plan.system_operator_id)
    const fromPlan = toIso2(plan.country_code, iso3to2, iso2Set)
    const fromOp = plan.system_operator_id ? operatorCountryIso2.get(plan.system_operator_id) : undefined
    const iso2 = fromPlan ?? fromOp ?? null
    if (iso2) planCountryIso2.set(planId, iso2)
  }

  for (const m of planMappings) {
    const fromMapping = toIso2(m.country_code, iso3to2, iso2Set)
    const fromPlan = planCountryIso2.get(m.system_plan_id)
    const fromOp = planToOperator.get(m.system_plan_id)
      ? operatorCountryIso2.get(planToOperator.get(m.system_plan_id)!)
      : undefined
    addProvider(fromMapping ?? fromPlan ?? fromOp ?? null, m.service_provider_id)
  }

  // Active internal plans by country (using internal_plans country_iso3)
  const plansByIso2 = new Map<string, number>()
  for (const p of plans) {
    if (!p.active) continue
    const iso2 = toIso2(p.country_iso3, iso3to2, iso2Set)
    if (iso2) plansByIso2.set(iso2, (plansByIso2.get(iso2) ?? 0) + 1)
  }

  // Group profiles by country (country column is ISO2)
  const usersByIso2 = new Map<string, number>()
  for (const prof of profiles) {
    const iso2 = toIso2(prof.country, iso3to2, iso2Set)
    if (iso2) usersByIso2.set(iso2, (usersByIso2.get(iso2) ?? 0) + 1)
  }

  // ── Per-country aggregates from transactions (amounts converted to EUR) ──
  const toEur = await createReportFxConverter()

  type CAgg = {
    total: number; success: number; failed: number; pending: number
    revenue: number; cost: number; lastDate: string
    opCounts: Map<string, number>; provCounts: Map<string, number>
  }
  const byIso2 = new Map<string, CAgg>()

  for (const tx of transactions) {
    const ro = firstJoin(tx.recharge_orders)
    const meta = tx.metadata as Record<string, unknown> | null
    const profile = firstJoin(tx.profiles)

    const rawCode = isOrigin
      ? (profile?.country ?? meta?.origin_country ?? meta?.user_country ?? meta?.origin_country_code ?? '')
      : (ro?.country_iso ?? meta?.country_id ?? meta?.destination_country_code ?? meta?.country_iso2 ?? '')

    const iso2 = toIso2(rawCode, iso3to2, iso2Set)
    if (!iso2) continue
    if (countryFilter && iso2 !== countryFilter && String(rawCode).toUpperCase() !== countryFilter) continue

    if (!byIso2.has(iso2)) {
      byIso2.set(iso2, {
        total: 0, success: 0, failed: 0, pending: 0,
        revenue: 0, cost: 0, lastDate: '',
        opCounts: new Map(), provCounts: new Map(),
      })
    }
    const agg = byIso2.get(iso2)!
    agg.total++

    const payCurrency = String((tx as { currency?: string }).currency ?? 'EUR').toUpperCase()
    const st = (tx.status ?? '').toLowerCase()
    if (st === 'completed' || st === 'success') {
      agg.success++
      const revEur = toEur(n(tx.amount), payCurrency)
      agg.revenue += revEur

      const roMeta = ro?.metadata as Record<string, unknown> | null
      const costNative = resolveProviderCostAmount(meta, roMeta) || n(ro?.send_amount) || (n(tx.amount) * 0.88)
      const costCur = resolveProviderCostCurrency(roMeta ?? meta, payCurrency)
      agg.cost += toEur(costNative, costCur)

      if (ro?.provider) agg.provCounts.set(ro.provider, (agg.provCounts.get(ro.provider) ?? 0) + 1)
    } else if (st === 'failed' || st === 'error') {
      agg.failed++
    } else {
      agg.pending++
    }
    if (ro?.operator_name) agg.opCounts.set(ro.operator_name, (agg.opCounts.get(ro.operator_name) ?? 0) + 1)
    if (tx.created_at > agg.lastDate) agg.lastDate = tx.created_at
  }

  // ── Build rows ────────────────────────────────────────────────────────────
  const allRows = countries
    .filter((c) => {
      const iso2 = c.iso2.toUpperCase()
      if (countryFilter && iso2 !== countryFilter && c.iso3.toUpperCase() !== countryFilter) return false
      if (!search) return true
      return (
        c.name.toLowerCase().includes(search) ||
        c.iso2.toLowerCase().includes(search) ||
        c.iso3.toLowerCase().includes(search)
      )
    })
    .map((c) => {
      const iso2       = c.iso2.toUpperCase()
      const agg        = byIso2.get(iso2)
      const opCount    = opsByIso2.get(iso2) ?? 0
      const planCount  = plansByIso2.get(iso2) ?? 0
      const provCount  = providersByIso2.get(iso2)?.size ?? 0
      const userCount  = usersByIso2.get(iso2) ?? 0
      const revenue    = agg?.revenue ?? 0
      const cost       = agg?.cost ?? 0

      const topOp  = agg?.opCounts.size  ? [...agg.opCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]  : ''
      const topProv= agg?.provCounts.size ? [...agg.provCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : ''

      return {
        country_flag:    getFlagEmoji(iso2),
        country_name:    c.name,
        iso2,
        iso3:            c.iso3,
        currency_code:   getCountryCurrency(iso2),
        total_users:     userCount,
        total_operators: opCount,
        total_providers: provCount,
        total_plans:     planCount,
        total_txns:      agg?.total ?? 0,
        success_count:   agg?.success ?? 0,
        failed_count:    agg?.failed ?? 0,
        pending_count:   agg?.pending ?? 0,
        success_rate:    pct(agg?.success ?? 0, agg?.total ?? 0),
        revenue:         parseFloat(revenue.toFixed(2)),
        provider_cost:   parseFloat(cost.toFixed(2)),
        profit:          parseFloat((revenue - cost).toFixed(2)),
        avg_recharge:    (agg?.success ?? 0) > 0 ? parseFloat((revenue / (agg?.success ?? 1)).toFixed(2)) : 0,
        top_operator:    topOp,
        top_provider:    topProv,
        last_recharge:   agg?.lastDate ?? '',
      }
    })

  // ── Sort rows ─────────────────────────────────────────────────────────────
  const sortCol = body.sort?.column || 'revenue'
  const sortDir = body.sort?.direction || 'desc'
  allRows.sort((a, b) => {
    const valA = (a as Record<string, unknown>)[sortCol]
    const valB = (b as Record<string, unknown>)[sortCol]
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortDir === 'asc' ? valA - valB : valB - valA
    }
    const strA = String(valA ?? '')
    const strB = String(valB ?? '')
    return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA)
  })

  // ── KPI summary cards ─────────────────────────────────────────────────────
  const successTxns = [...byIso2.values()].reduce((s, a) => s + a.success, 0)
  const totalRev    = allRows.reduce((s, r) => s + r.revenue, 0)
  const totalOps    = operators.filter((o) => !o.status || o.status.toUpperCase() === 'ACTIVE').length

  const withTxns = allRows.filter((r) => r.total_txns > 0)
  const byRevenue = [...withTxns].sort((a, b) => b.revenue - a.revenue)
  const byTxns    = [...withTxns].sort((a, b) => b.total_txns - a.total_txns)
  // Require a small sample so 1/1 = 100% doesn't dominate
  const rateEligible = withTxns.filter((r) => r.total_txns >= 5)
  const bySuccessHigh = [...(rateEligible.length ? rateEligible : withTxns)].sort((a, b) => b.success_rate - a.success_rate)
  const bySuccessLow  = [...(rateEligible.length ? rateEligible : withTxns)].sort((a, b) => a.success_rate - b.success_rate)

  const topCountry       = byRevenue[0]
  const topTxnCountry    = byTxns[0]
  const highestSuccess   = bySuccessHigh[0]
  const lowestSuccess    = bySuccessLow[0]
  const avgRecharge      = successTxns > 0 ? parseFloat((totalRev / successTxns).toFixed(2)) : 0

  const summaryCards = [
    {
      id: 'total_countries',
      label: 'Total Countries',
      icon: 'Globe',
      value: allRows.length,
    },
    {
      id: 'top_country',
      label: 'Top Country',
      icon: 'Trophy',
      value: topCountry ? `${topCountry.country_flag} ${topCountry.country_name}` : '—',
      description: topCountry ? `${topCountry.total_txns} txns · €${topCountry.revenue.toFixed(2)}` : undefined,
    },
    {
      id: 'highest_revenue_country',
      label: 'Highest Revenue Country',
      icon: 'DollarSign',
      value: topCountry ? `${topCountry.country_flag} ${topCountry.country_name}` : '—',
      description: topCountry ? `€${topCountry.revenue.toFixed(2)}` : undefined,
    },
    {
      id: 'highest_transaction_country',
      label: 'Highest Transaction Country',
      icon: 'ArrowRightLeft',
      value: topTxnCountry ? `${topTxnCountry.country_flag} ${topTxnCountry.country_name}` : '—',
      description: topTxnCountry ? `${topTxnCountry.total_txns} transactions` : undefined,
    },
    {
      id: 'highest_success_rate',
      label: 'Highest Success Rate',
      icon: 'TrendingUp',
      value: highestSuccess ? `${highestSuccess.country_flag} ${highestSuccess.country_name}` : '—',
      description: highestSuccess ? `${highestSuccess.success_rate}%` : undefined,
    },
    {
      id: 'lowest_success_rate',
      label: 'Lowest Success Rate',
      icon: 'TrendingDown',
      value: lowestSuccess ? `${lowestSuccess.country_flag} ${lowestSuccess.country_name}` : '—',
      description: lowestSuccess ? `${lowestSuccess.success_rate}%` : undefined,
    },
    {
      id: 'average_recharge',
      label: 'Average Recharge',
      icon: 'CreditCard',
      value: avgRecharge,
      currency: 'EUR',
    },
    {
      id: 'active_networks',
      label: 'Active Networks',
      icon: 'Signal',
      value: totalOps,
    },
  ]

  // ── Chart data ────────────────────────────────────────────────────────────
  const revenueByCountry   = byRevenue.slice(0, 20).map((r) => ({ label: r.country_name, value: r.revenue }))
  const txByCountry        = byTxns.slice(0, 20).map((r) => ({ label: r.country_name, value: r.total_txns }))
  const successRateByCtry  = bySuccessHigh.slice(0, 15).map((r) => ({ label: r.country_name, value: r.success_rate }))
  const profitByCountry    = [...withTxns].filter((r) => r.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 15).map((r) => ({ label: r.country_name, value: r.profit }))

  // Trend line
  const gran = granularity(from, to)
  const trend = new Map<string, number>()
  for (const tx of transactions) {
    const ro = firstJoin(tx.recharge_orders)
    const meta = tx.metadata as Record<string, unknown> | null
    const profile = firstJoin(tx.profiles)
    const rawCode = isOrigin
      ? (profile?.country ?? meta?.origin_country ?? meta?.user_country ?? '')
      : (ro?.country_iso ?? meta?.country_id ?? '')
    const iso2 = toIso2(rawCode, iso3to2, iso2Set)
    if (!iso2) continue
    if (countryFilter && iso2 !== countryFilter) continue

    const d = new Date(tx.created_at)
    const key = gran === 'hour' ? `${d.toISOString().slice(0, 13)}:00`
              : gran === 'day'  ? d.toISOString().slice(0, 10)
              :                   d.toISOString().slice(0, 7)
    trend.set(key, (trend.get(key) ?? 0) + 1)
  }
  const trendData = [...trend.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }))

  const chartData = [
    { id: 'revenue_by_country',   name: 'Revenue by Country',        type: 'bar',  data: revenueByCountry },
    { id: 'txns_by_country',      name: 'Transactions by Country',   type: 'bar',  data: txByCountry },
    { id: 'success_rate_country', name: 'Success Rate by Country',   type: 'bar',  data: successRateByCtry },
    { id: 'profit_by_country',    name: 'Top Countries by Profit',   type: 'bar',  data: profitByCountry },
    { id: 'trend',                name: 'Country Transaction Trend', type: 'line', data: trendData },
  ]

  // ── Pagination ────────────────────────────────────────────────────────────
  const total     = allRows.length
  const pagedRows = allRows.slice((pageNum - 1) * pageSize, pageNum * pageSize)

  const result = { rows: pagedRows, pagination: { page: pageNum, pageSize, total }, summaryCards, chartData }
  cacheSet(cacheKey, result)
  return NextResponse.json(result)
}
