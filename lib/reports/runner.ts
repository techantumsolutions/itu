/**
 * Report Runner — executes a query built from ReportConfig, then transforms
 * the raw PostgREST rows into the standard ReportData shape:
 *
 *   1. Execute data query via supabaseRest
 *   2. Get total count (HEAD + Prefer:count=exact)
 *   3. Inject pre-aggregation virtual keys (e.g. _provider_key from metadata)
 *   4. Apply column compute() functions
 *   5. Apply client-side filter mappings
 *   6. Aggregate in memory (if config.aggregation defined)
 *   7. Sort + paginate aggregated results
 *   8. Apply config.search to aggregated results
 *   9. Compute summary cards
 *  10. Build chart series
 *  11. Return ReportData
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import { buildQuery } from './query-builder'
import type { ReportConfig, AggregationConfig, SummaryCardConfig, ChartSeriesConfig, FilterMapping } from './config'
import type { ReportData, ReportRow, SummaryCard, ChartSeries, ChartDataPoint, ReportFilters, ReportSort, ReportPagination } from './types'
import {
  createReportFxConverter,
  resolveProviderCostAmount,
  resolveProviderCostCurrency,
  type ReportFxConverter,
} from './fx'
import {
  computePaymentGatewayFee,
  loadItuRateContext,
  loadRoutingCostsForItuRows,
  resolveItuAmountsForRow,
  unwrapTransaction,
  type ItuRechargeRow,
} from '@/lib/admin/itu-revenue'
import {
  loadLcrProviderIndex,
  resolveProviderFromRow,
  type LcrProviderIndex,
} from './resolve-provider'
import {
  loadOperatorCatalog,
  resolveOperatorFromRow,
  type OperatorCatalog,
} from './resolve-operator'

// ─── Helper utils ─────────────────────────────────────────────────────────────

function n(v: unknown): number {
  const num = Number(v)
  return Number.isFinite(num) ? num : 0
}

function sortRows(rows: ReportRow[], col: string, dir: 'asc' | 'desc'): ReportRow[] {
  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col]
    if (av === bv) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv))
    return dir === 'asc' ? cmp : -cmp
  })
}

function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize)
}

function unwrapOne(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) {
    return v[0] && typeof v[0] === 'object' ? (v[0] as Record<string, unknown>) : null
  }
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

/** Merge recharge aggregates with Admin Customers directory (same source as /admin/customers).
 *  Also appends admin/staff (and other non-customer) accounts that have recharges,
 *  labeled by role — they appear in the table but do not count toward Total Users. */
async function mergeCustomerDirectoryRows(aggRows: ReportRow[]): Promise<ReportRow[]> {
  try {
    const res = await supabaseRest(
      'admin_customer_spend?app_role=eq.user&select=user_id,email,name,phone,country,total_spend,transaction_count,last_transaction_at&order=email.asc.nullslast',
      { cache: 'no-store' },
    )
    if (!res.ok) return aggRows
    const customers = (await res.json()) as Array<{
      user_id: string
      email: string | null
      name: string | null
      phone: string | null
      country: string | null
      total_spend: number | string | null
      transaction_count: number | string | null
      last_transaction_at: string | null
    }>
    if (!Array.isArray(customers) || customers.length === 0) return aggRows

    const byId = new Map<string, ReportRow>()
    const byEmail = new Map<string, ReportRow>()
    for (const row of aggRows) {
      const id = String(row._user_key ?? '').trim()
      if (id) byId.set(id, row)
      const email = String(row.email ?? row._email ?? '').trim().toLowerCase()
      if (email && email !== 'unknown' && email !== '—') byEmail.set(email, row)
    }

    const merged: ReportRow[] = []
    const usedKeys = new Set<string>()

    for (const c of customers) {
      const uid = String(c.user_id ?? '').trim()
      const emailKey = String(c.email ?? '').trim().toLowerCase()
      const existing = (uid && byId.get(uid)) || (emailKey ? byEmail.get(emailKey) : undefined)
      const txCount = n(c.transaction_count)
      const email = String(c.email ?? '').trim() || '—'

      if (uid) usedKeys.add(uid)
      if (emailKey) usedKeys.add(emailKey)

      if (existing) {
        const orders = n(existing.orders)
        const active = orders > 0 || n(existing.success_count) > 0 || txCount > 0
        merged.push({
          ...existing,
          _user_key: uid || existing._user_key,
          email,
          customer_name: String(c.name ?? existing.customer_name ?? '—'),
          phone: String(c.phone ?? existing.phone ?? '—'),
          country: String(c.country ?? existing.country ?? '—').toUpperCase() || '—',
          transaction_count: txCount,
          role: 'User',
          _app_role: 'user',
          _counts_as_user: true,
          status: active ? 'active' : 'inactive',
          last_order: existing.last_order ?? c.last_transaction_at,
        })
      } else {
        merged.push({
          _user_key: uid,
          email,
          customer_name: String(c.name ?? '—'),
          phone: String(c.phone ?? '—'),
          country: String(c.country ?? '—').toUpperCase() || '—',
          orders: 0,
          success_count: 0,
          failed_count: 0,
          ltv: 0,
          avg_order: 0,
          success_rate: 0,
          fail_rate: 0,
          top_provider: '—',
          first_order: null,
          last_order: c.last_transaction_at,
          transaction_count: txCount,
          role: 'User',
          _app_role: 'user',
          _counts_as_user: true,
          status: txCount > 0 ? 'active' : 'inactive',
        })
      }
    }

    // Resolve roles for non-customer recharge accounts (admin / staff / other)
    const leftovers = aggRows.filter((row) => {
      if (n(row.orders) <= 0) return false
      const key = String(row._user_key ?? '').trim()
      const email = String(row.email ?? row._email ?? '').trim().toLowerCase()
      if (key && usedKeys.has(key)) return false
      if (email && usedKeys.has(email)) return false
      return true
    })

    const needRoleIds = leftovers
      .filter((r) => !String(r._app_role ?? '').trim())
      .map((r) => String(r._user_key ?? '').trim())
      .filter(Boolean)

    const roleById = new Map<string, string>()
    if (needRoleIds.length > 0) {
      try {
        const ids = [...new Set(needRoleIds)].map(encodeURIComponent).join(',')
        const roleRes = await supabaseRest(
          `profiles?id=in.(${ids})&select=id,app_role`,
          { cache: 'no-store' },
        )
        if (roleRes.ok) {
          const profiles = (await roleRes.json()) as Array<{ id: string; app_role: string | null }>
          for (const p of profiles ?? []) {
            roleById.set(String(p.id), String(p.app_role ?? '').toLowerCase())
          }
        }
      } catch {
        // keep defaults
      }
    }

    for (const row of leftovers) {
      const key = String(row._user_key ?? '').trim()
      const rawRole = (
        String(row._app_role ?? '').trim() ||
        (key ? roleById.get(key) : '') ||
        'staff'
      ).toLowerCase()
      const roleLabel =
        rawRole === 'admin' ? 'Admin' :
        rawRole === 'staff' ? 'Staff' :
        rawRole === 'user' ? 'User' :
        rawRole ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1) : 'Staff'

      merged.push({
        ...row,
        role: roleLabel,
        _app_role: rawRole,
        _counts_as_user: false,
        status: n(row.orders) > 0 ? 'active' : 'inactive',
      })
    }

    return merged
  } catch {
    return aggRows
  }
}

/**
 * Flatten / resolve display fields for list-style reports.
 */
function enrichReportRows(
  rows: Record<string, unknown>[],
  config: ReportConfig,
  providerIndex?: LcrProviderIndex,
  operatorCatalog?: OperatorCatalog,
): Record<string, unknown>[] {
  if (config.id === 'transactions') {
    return rows.map((row) => {
      const ro = unwrapOne(row.recharge_orders) ?? (
        row.phone_number != null || row.operator_name != null ? row : null
      )
      const txn = unwrapOne(row.transactions)
      const prof = unwrapOne(row.profiles)
      const meta = (txn?.metadata ?? row.metadata ?? ro?.metadata) as Record<string, unknown> | null
      const roMeta = ((ro?.metadata ?? {}) as Record<string, unknown>)

      const resolveRow = {
        ...row,
        metadata: meta ?? row.metadata,
        recharge_orders: row.recharge_orders ?? (ro ? {
          provider: ro.provider,
          provider_ref: ro.provider_ref,
          operator_name: ro.operator_name,
          operator_code: ro.operator_code,
          country_iso: ro.country_iso,
          status: ro.status,
          metadata: roMeta,
        } : row.recharge_orders),
      }

      const provider = resolveProviderFromRow(resolveRow, providerIndex)
      const operator = resolveOperatorFromRow(resolveRow, operatorCatalog)
      const paid = n(txn?.amount ?? row.amount ?? ro?.send_amount)
      const cost =
        n(meta?.selected_provider_cost) ||
        n((meta?.lcr_result as Record<string, unknown> | null)?.selectedProviderCost) ||
        n(roMeta.selected_provider_cost) ||
        n(roMeta.provider_cost) ||
        n(ro?.receive_amount)
      const roStatus = String(ro?.status ?? row.status ?? '').toLowerCase()
      const isCompleted = roStatus === 'completed'
      const isRefunded = roStatus === 'refunded' || String(row.status ?? '').toLowerCase() === 'refunded'

      return {
        ...row,
        transaction_id: String(txn?.id ?? row.transaction_id ?? row.id ?? ''),
        customer: String(prof?.email ?? meta?.customer_email ?? '—'),
        customer_name: String(prof?.name ?? '—'),
        phone_number: String(ro?.phone_number ?? meta?.mobile_number ?? meta?.phone_number ?? '—'),
        country: String(ro?.country_iso ?? meta?.country_id ?? '—').toUpperCase(),
        operator: operator.label,
        provider: provider.label,
        provider_code: provider.code,
        provider_ref: String(ro?.provider_ref ?? meta?.provider_ref ?? provider.providerRef ?? '—'),
        currency: String(txn?.currency ?? row.currency ?? ro?.send_currency ?? 'EUR').toUpperCase(),
        customer_paid: paid,
        recharge_amount: n(ro?.send_amount ?? paid),
        provider_cost: isCompleted ? cost : 0,
        profit: isCompleted ? parseFloat(Math.max(0, paid - cost).toFixed(2)) : 0,
        payment_status: String(
          ro?.payment_status ?? meta?.payment_status ?? (isCompleted ? 'paid' : row.status ?? '—'),
        ),
        recharge_status: roStatus || String(row.status ?? '—'),
        failure_reason: String(ro?.failure_reason ?? meta?.error ?? meta?.error_message ?? '—'),
        processing_time: (() => {
          const ms = n(roMeta.processing_time_ms ?? meta?.processing_time_ms ?? meta?.latency_ms)
          return ms > 0 ? `${ms}ms` : '—'
        })(),
        _is_completed: isCompleted ? 1 : 0,
        _is_failed: roStatus === 'failed' || roStatus === 'error' ? 1 : 0,
        _is_refunded: isRefunded ? 1 : 0,
        _is_pending: ['pending', 'processing', 'pending_payment'].includes(roStatus) ? 1 : 0,
      }
    })
  }

  if (config.id === 'reconciliation') {
    return rows.map((row) => {
      const totals = pickReconTotals(row)
      const health = asRecord(row.health_metrics)
      const validation = asRecord(row.validation_errors)
      const providerRaw = String(row.provider ?? '')
      const matched = providerIndex
        ? providerIndex.byCode.get(providerRaw.toLowerCase())
          ?? providerIndex.byName.get(providerRaw.toLowerCase())
        : null

      const supplierBilled = n(
        totals.supplier_billed ?? totals.supplierBilled ?? row.supplier_billed,
      )
      const platformExpected = n(
        totals.platform_expected ?? totals.platformExpected ?? row.platform_expected,
      )
      const costDifference = n(
        totals.cost_difference
          ?? totals.costDifference
          ?? totals.amount_difference
          ?? row.amount_difference,
      )
      const refunds = n(totals.refunds ?? row.refunds)
      // Prefer stored net_settlement; otherwise supplier billed − refunds (EUR).
      const netSettlement = totals.net_settlement != null || totals.netSettlement != null
        ? n(totals.net_settlement ?? totals.netSettlement)
        : parseFloat((supplierBilled - refunds).toFixed(2))

      return {
        ...row,
        provider: matched?.name ?? (providerRaw ? providerRaw.toUpperCase() : '—'),
        provider_code: matched?.code ?? (providerRaw ? providerRaw.toUpperCase() : null),
        billing_period: String(
          row.billing_period
            ?? ((row.period_start || row.period_end)
              ? `${row.period_start ?? ''} – ${row.period_end ?? ''}`
              : '—'),
        ),
        match_rate: n(health.match_rate ?? health.matchRate),
        auto_match_percent: n(health.auto_match_percent ?? health.autoMatchPercent),
        manual_review_percent: n(health.manual_review_percent ?? health.manualReviewPercent),
        supplier_billed: supplierBilled,
        platform_expected: platformExpected,
        amount_difference: costDifference,
        cost_difference: costDifference,
        refunds,
        net_settlement: netSettlement,
        currency: 'EUR',
        missing_rows: Array.isArray(validation.missing_columns) ? validation.missing_columns.length : 0,
        duplicate_rows: Array.isArray(validation.duplicate_rows) ? validation.duplicate_rows.length : 0,
        extra_rows: Array.isArray(validation.unsupported_providers)
          ? validation.unsupported_providers.length
          : 0,
        currency_issues: Array.isArray(validation.invalid_currencies)
          ? validation.invalid_currencies.length
          : 0,
        display_status: String(row.settlement_status ?? row.status ?? '—'),
      }
    })
  }

  return rows
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Read reconciliation totals from totals / summary_details (snake or camel). */
function pickReconTotals(row: Record<string, unknown>): Record<string, unknown> {
  const totals = asRecord(row.totals)
  const summary = asRecord(row.summary_details)
  return { ...summary, ...totals }
}

/**
 * Recompute report money fields from reconciliation_items in EUR so Cost Variance /
 * Net Settlement match line-item reality (and are currency-safe).
 *
 * Critical: refund_amount is usually in the *customer payment* currency (e.g. INR),
 * while supplier billed is in the supplier file currency (e.g. EUR). Both must be
 * converted to EUR before Net Settlement = billed − refunds.
 */
async function recomputeReconciliationTotalsInEur(
  rows: Record<string, unknown>[],
  toEur: ReportFxConverter,
): Promise<Record<string, unknown>[]> {
  const ids = rows.map((r) => String(r.id ?? '').trim()).filter(Boolean)
  if (ids.length === 0) return rows

  const byReport = new Map<string, {
    supplier_billed: number
    platform_expected: number
    refunds: number
  }>()

  type ReconItemRow = {
    report_id: string
    transaction_id?: string | null
    amount: number | string | null
    currency: string | null
    provider_cost: number | string | null
    refund_amount: number | string | null
    reconciliation_details?: Record<string, unknown> | null
  }

  const allItems: ReconItemRow[] = []
  const chunkSize = 50
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const res = await supabaseRest(
      `reconciliation_items?report_id=in.(${chunk.join(',')})&select=report_id,transaction_id,amount,currency,provider_cost,refund_amount,reconciliation_details&limit=20000`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const items = (await res.json().catch(() => [])) as ReconItemRow[]
    if (Array.isArray(items)) allItems.push(...items)
  }

  // Resolve customer-payment currency for refunds from linked transactions (legacy rows).
  const txIdsNeedingCurrency = [
    ...new Set(
      allItems
        .filter((item) => {
          if (n(item.refund_amount) <= 0) return false
          const details = asRecord(item.reconciliation_details)
          const financial = asRecord(details.financial)
          const platformSnap = asRecord(details.platform_snapshot)
          return !financial.refund_currency && !platformSnap.paid_currency && item.transaction_id
        })
        .map((item) => String(item.transaction_id)),
    ),
  ]
  const txCurrencyById = new Map<string, string>()
  for (let i = 0; i < txIdsNeedingCurrency.length; i += chunkSize) {
    const chunk = txIdsNeedingCurrency.slice(i, i + chunkSize)
    if (chunk.length === 0) continue
    const txRes = await supabaseRest(
      `transactions?id=in.(${chunk.join(',')})&select=id,currency,amount`,
      { cache: 'no-store' },
    )
    if (!txRes.ok) continue
    const txs = (await txRes.json().catch(() => [])) as Array<{
      id: string
      currency: string | null
      amount: number | string | null
    }>
    for (const tx of txs ?? []) {
      const cur = String(tx.currency ?? '').trim().toUpperCase()
      if (cur) txCurrencyById.set(String(tx.id), cur)
    }
  }

  for (const item of allItems) {
    const rid = String(item.report_id ?? '')
    if (!rid) continue
    const details = asRecord(item.reconciliation_details)
    const supplierSnap = asRecord(details.supplier_snapshot)
    const platformSnap = asRecord(details.platform_snapshot)
    const financial = asRecord(details.financial)

    const billedCur = String(
      supplierSnap.billed_currency ?? item.currency ?? 'EUR',
    ).toUpperCase()
    const expectedCur = String(
      platformSnap.recorded_currency ?? item.currency ?? 'EUR',
    ).toUpperCase()

    const txId = String(item.transaction_id ?? platformSnap.transaction_id ?? '')
    const refundCur = String(
      financial.refund_currency
        ?? platformSnap.paid_currency
        ?? (txId ? txCurrencyById.get(txId) : '')
        ?? '',
    ).toUpperCase() || inferRefundCurrency(n(item.refund_amount), billedCur, expectedCur)

    const billed = toEur(n(item.amount ?? supplierSnap.billed_amount), billedCur)
    const expected = toEur(
      n(item.provider_cost ?? platformSnap.recorded_cost),
      expectedCur,
    )
    const refundRaw = n(item.refund_amount ?? financial.refund_amount)
    const refund = refundRaw > 0 ? toEur(refundRaw, refundCur) : 0

    const agg = byReport.get(rid) ?? { supplier_billed: 0, platform_expected: 0, refunds: 0 }
    agg.supplier_billed += billed
    agg.platform_expected += expected
    agg.refunds += refund
    byReport.set(rid, agg)
  }

  if (byReport.size === 0) return rows

  return rows.map((row) => {
    const rid = String(row.id ?? '')
    const agg = byReport.get(rid)
    if (!agg) return row

    const supplierBilled = parseFloat(agg.supplier_billed.toFixed(2))
    const platformExpected = parseFloat(agg.platform_expected.toFixed(2))
    const refunds = parseFloat(agg.refunds.toFixed(2))
    const costDifference = parseFloat((platformExpected - supplierBilled).toFixed(2))
    // Same-currency (EUR) subtraction only
    const netSettlement = parseFloat((supplierBilled - refunds).toFixed(2))

    return {
      ...row,
      totals: {
        supplier_billed: supplierBilled,
        platform_expected: platformExpected,
        cost_difference: costDifference,
        refunds,
        net_settlement: netSettlement,
        currency: 'EUR',
      },
      summary_details: {
        supplier_billed: supplierBilled,
        platform_expected: platformExpected,
        cost_difference: costDifference,
        refunds,
        net_settlement: netSettlement,
        currency: 'EUR',
      },
      supplier_billed: supplierBilled,
      platform_expected: platformExpected,
      amount_difference: costDifference,
      cost_difference: costDifference,
      refunds,
      net_settlement: netSettlement,
      currency: 'EUR',
    }
  })
}

/**
 * Legacy fallback when refund currency is unknown.
 * Large raw amounts are typically customer INR payments, not EUR wholesale.
 */
function inferRefundCurrency(
  refundAmount: number,
  billedCur: string,
  expectedCur: string,
): string {
  if (!(refundAmount > 0)) return billedCur || 'EUR'
  if (refundAmount >= 50) return 'INR'
  if (expectedCur && expectedCur !== billedCur) return expectedCur
  return billedCur || 'EUR'
}

/** Platform Gross / Cost / Refunds for the report date range — same rules as Financial. */
async function loadPlatformItuSnapshot(filters: ReportFilters): Promise<{
  gross: number
  cost: number
  refund: number
}> {
  try {
    const from = filters.dateRange?.from
    const to = filters.dateRange?.to
    const dateParts: string[] = ['status=neq.pending_payment']
    if (from) dateParts.push(`created_at=gte.${from}T00:00:00Z`)
    if (to) dateParts.push(`created_at=lte.${to}T23:59:59Z`)

    const select =
      'id,status,payment_status,created_at,transaction_id,send_amount,send_currency,receive_amount,receive_currency,transactions(amount,currency,status,metadata)'
    const query =
      `recharge_orders?select=${encodeURIComponent(select)}&${dateParts.join('&')}&order=created_at.asc&limit=50000`

    const res = await supabaseRest(query, { cache: 'no-store' })
    if (!res.ok) return { gross: 0, cost: 0, refund: 0 }
    const rawRows = (await res.json().catch(() => [])) as ItuRechargeRow[]
    if (!Array.isArray(rawRows) || rawRows.length === 0) return { gross: 0, cost: 0, refund: 0 }

    const { reportingCurrency, rateMap, fallbackRates } = await loadItuRateContext()
    const routingCosts = await loadRoutingCostsForItuRows(rawRows)

    let gross = 0
    let cost = 0
    let refund = 0
    for (const row of rawRows) {
      const itu = resolveItuAmountsForRow(
        row,
        reportingCurrency,
        rateMap,
        fallbackRates,
        routingCosts,
      )
      gross += itu.grossReporting
      cost += itu.costReporting
      refund += itu.refundReporting
    }

    return {
      gross: parseFloat(gross.toFixed(2)),
      cost: parseFloat(cost.toFixed(2)),
      refund: parseFloat(refund.toFixed(2)),
    }
  } catch {
    return { gross: 0, cost: 0, refund: 0 }
  }
}

// ─── Count via Content-Range ──────────────────────────────────────────────────

async function fetchCount(countQuery: string): Promise<number> {
  try {
    const res = await supabaseRest(countQuery, {
      method: 'HEAD',
      cache:  'no-store',
      headers: { Prefer: 'count=exact' } as Record<string, string>,
    })
    const range = res.headers.get('Content-Range') ?? '' // "0-49/1234"
    const match = range.match(/\/(\d+)$/)
    if (match) return parseInt(match[1], 10)
    return 0
  } catch {
    return 0
  }
}

// ─── Pre-aggregation virtual key injection ────────────────────────────────────

/**
 * Convert monetary fields on raw PostgREST rows to EUR before compute/aggregation.
 * Keeps the original `currency` code for display context.
 */
function convertRawAmountsToEur(
  rows: Record<string, unknown>[],
  toEur: ReportFxConverter,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const r: Record<string, unknown> = { ...row }
    const payCurrency = String(r.currency ?? r.send_currency ?? 'EUR').toUpperCase()

    if (r.amount != null) r.amount = toEur(n(r.amount), payCurrency)
    if (r.send_amount != null) {
      r.send_amount = toEur(n(r.send_amount), String(r.send_currency ?? payCurrency).toUpperCase())
    }
    if (r.receive_amount != null) {
      r.receive_amount = toEur(
        n(r.receive_amount),
        String(r.receive_currency ?? payCurrency).toUpperCase(),
      )
    }
    if (r.balance != null) r.balance = toEur(n(r.balance), payCurrency)
    if (r.total_credited != null) r.total_credited = toEur(n(r.total_credited), payCurrency)
    if (r.total_debited != null) r.total_debited = toEur(n(r.total_debited), payCurrency)
    if (r.gross_amount != null) r.gross_amount = toEur(n(r.gross_amount), payCurrency)
    if (r.adjustments != null) r.adjustments = toEur(n(r.adjustments), payCurrency)
    if (r.net_payable != null) r.net_payable = toEur(n(r.net_payable), payCurrency)

    const meta = r.metadata as Record<string, unknown> | null | undefined
    if (meta && typeof meta === 'object') {
      const nextMeta = { ...meta }
      const cost = resolveProviderCostAmount(meta)
      if (cost > 0) {
        const costCur = resolveProviderCostCurrency(meta, payCurrency)
        nextMeta.selected_provider_cost = toEur(cost, costCur)
        nextMeta.selected_provider_currency = 'EUR'
        const lcr = nextMeta.lcr_result as Record<string, unknown> | undefined
        if (lcr && typeof lcr === 'object') {
          nextMeta.lcr_result = {
            ...lcr,
            selectedProviderCost: toEur(
              n(lcr.selectedProviderCost) || cost,
              resolveProviderCostCurrency(meta, payCurrency),
            ),
            selectedProviderCurrency: 'EUR',
          }
        }
      }
      r.metadata = nextMeta
    }

    const convertRo = (ro: Record<string, unknown>): Record<string, unknown> => {
      const next = { ...ro }
      const roCur = String(next.send_currency ?? payCurrency).toUpperCase()
      if (next.send_amount != null) next.send_amount = toEur(n(next.send_amount), roCur)
      const roMeta = next.metadata as Record<string, unknown> | null | undefined
      if (roMeta && typeof roMeta === 'object') {
        const m = { ...roMeta }
        const cost = resolveProviderCostAmount(m)
        if (cost > 0) {
          m.selected_provider_cost = toEur(cost, resolveProviderCostCurrency(m, roCur))
          m.selected_provider_currency = 'EUR'
          if (m.provider_cost != null) m.provider_cost = toEur(n(m.provider_cost), resolveProviderCostCurrency(m, roCur))
        }
        next.metadata = m
      }
      return next
    }

    if (Array.isArray(r.recharge_orders)) {
      r.recharge_orders = (r.recharge_orders as Record<string, unknown>[]).map(convertRo)
    } else if (r.recharge_orders && typeof r.recharge_orders === 'object') {
      r.recharge_orders = convertRo(r.recharge_orders as Record<string, unknown>)
    }

    // Nested transactions (e.g. failed recharge report)
    if (Array.isArray(r.transactions)) {
      r.transactions = (r.transactions as Record<string, unknown>[]).map((t) => {
        const cur = String(t.currency ?? payCurrency).toUpperCase()
        const next = { ...t, amount: t.amount != null ? toEur(n(t.amount), cur) : t.amount }
        const tMeta = t.metadata as Record<string, unknown> | null | undefined
        if (tMeta && typeof tMeta === 'object') {
          const m = { ...tMeta }
          const cost = resolveProviderCostAmount(m)
          if (cost > 0) {
            m.selected_provider_cost = toEur(cost, resolveProviderCostCurrency(m, cur))
            m.selected_provider_currency = 'EUR'
          }
          next.metadata = m
        }
        return next
      })
    } else if (r.transactions && typeof r.transactions === 'object') {
      const t = r.transactions as Record<string, unknown>
      const cur = String(t.currency ?? payCurrency).toUpperCase()
      const next = { ...t, amount: t.amount != null ? toEur(n(t.amount), cur) : t.amount }
      const tMeta = t.metadata as Record<string, unknown> | null | undefined
      if (tMeta && typeof tMeta === 'object') {
        const m = { ...tMeta }
        const cost = resolveProviderCostAmount(m)
        if (cost > 0) {
          m.selected_provider_cost = toEur(cost, resolveProviderCostCurrency(m, cur))
          m.selected_provider_currency = 'EUR'
        }
        next.metadata = m
      }
      r.transactions = next
    }

    return r
  })
}

/**
 * Some aggregation configs group on a key that doesn't exist as a raw column
 * (e.g. "_provider_key" = metadata.selected_provider).
 * We inject these computed keys before grouping.
 * Amounts are expected to already be in EUR (via convertRawAmountsToEur).
 */
function injectVirtualKeys(
  rows: Record<string, unknown>[],
  config: ReportConfig,
  providerIndex?: LcrProviderIndex,
  operatorCatalog?: OperatorCatalog,
): Record<string, unknown>[] {
  const groupKey = config.aggregation?.groupByKey ?? ''

  if (!groupKey.startsWith('_') && config.id !== 'customer') {
    return rows
  }

  return rows.map((row) => {
    const r: Record<string, unknown> = { ...row }
    const meta = row.metadata as Record<string, unknown> | null | undefined

    switch (groupKey) {
      // Provider key — resolve name/code/UUID from RO, routing, LCR, lcr_providers
      case '_provider_key': {
        const ro = Array.isArray(row.recharge_orders)
          ? (row.recharge_orders[0] as Record<string, unknown> | undefined)
          : (row.recharge_orders as Record<string, unknown> | null)
        const roMeta = ro?.metadata as Record<string, unknown> | null | undefined
        const routing = meta?.routing as Record<string, unknown> | null | undefined
        const routingSelected = routing?.selected as Record<string, unknown> | null | undefined
        const resolved = resolveProviderFromRow(row, providerIndex)

        r[groupKey] = resolved.key
        r['provider'] = resolved.label
        r['provider_code'] = resolved.code
        r['provider_id'] = resolved.id
        r['_provider_ref'] = resolved.providerRef
        r['provider_ref'] = resolved.providerRef

        const cost =
          n(meta?.selected_provider_cost) ||
          n((meta?.lcr_result as Record<string, unknown> | null)?.selectedProviderCost) ||
          n(routingSelected?.price) ||
          n(roMeta?.selected_provider_cost) ||
          n(roMeta?.provider_cost) ||
          n(ro?.receive_amount)

        const roStatus = String(ro?.status ?? '').toLowerCase()
        const txStatus = String(row.status ?? '').toLowerCase()
        // Same gross rule as Financial / Dashboard: only completed recharge_orders
        const isSuccess = roStatus === 'completed'
        const isFailed = roStatus === 'failed' || roStatus === 'error' ||
          ((roStatus === '' || !ro) && (txStatus === 'failed' || txStatus === 'error'))
        r['_success'] = isSuccess ? 1 : 0
        r['_failed']  = isFailed ? 1 : 0
        r['_cost'] = isSuccess ? cost : 0

        const reason = String(
          ro?.failure_reason ?? meta?.failure_reason ?? meta?.error_message ?? meta?.error ?? '',
        ).toLowerCase()
        r['_timeout'] = (reason.includes('timeout') || reason.includes('deadline')) ? 1 : 0
        r['_retry']   = n(meta?.retry_count) ||
          n(roMeta?.retry_count) ||
          (Array.isArray(meta?.attempts) ? Math.max(0, (meta!.attempts as unknown[]).length - 1) : 0)
        r['_latency'] = n(meta?.latency_ms ?? meta?.processing_time_ms ?? roMeta?.processing_time_ms ?? roMeta?.latency_ms)
        r['_amount']  = isSuccess ? n(row.amount) : 0
        break
      }

      // Operator / network key — recharge_orders + system_operators catalog
      case '_operator_key': {
        const ro = Array.isArray(row.recharge_orders)
          ? (row.recharge_orders[0] as Record<string, unknown> | undefined)
          : (row.recharge_orders as Record<string, unknown> | null)
        const roMeta = ro?.metadata as Record<string, unknown> | null | undefined
        const routing = meta?.routing as Record<string, unknown> | null | undefined
        const routingSelected = routing?.selected as Record<string, unknown> | null | undefined
        const resolved = resolveOperatorFromRow(row, operatorCatalog)
        const provider = resolveProviderFromRow(row, providerIndex)

        r[groupKey] = resolved.key
        r['operator_name'] = resolved.label
        r['operator_id'] = resolved.systemOperatorId
        r['country'] = resolved.countryIso2 || resolved.countryIso3 || '—'
        r['country_iso3'] = resolved.countryIso3 || '—'
        r['providers_mapped'] = resolved.providerCount
        r['_provider'] = provider.label
        r['_provider_key'] = provider.key

        const cost =
          n(meta?.selected_provider_cost) ||
          n((meta?.lcr_result as Record<string, unknown> | null)?.selectedProviderCost) ||
          n(routingSelected?.price) ||
          n(roMeta?.selected_provider_cost) ||
          n(roMeta?.provider_cost) ||
          n(ro?.receive_amount)

        const roStatus = String(ro?.status ?? '').toLowerCase()
        const txStatus = String(row.status ?? '').toLowerCase()
        // Same gross rule as Financial / Dashboard: only completed recharge_orders
        const isSuccess = roStatus === 'completed'
        const isFailed = roStatus === 'failed' || roStatus === 'error' ||
          ((roStatus === '' || !ro) && (txStatus === 'failed' || txStatus === 'error'))
        r['_success'] = isSuccess ? 1 : 0
        r['_failed'] = isFailed ? 1 : 0
        r['_cost'] = isSuccess ? cost : 0
        r['_amount'] = isSuccess ? n(row.amount) : 0
        break
      }

      // Country key — destination or origin
      case '_country_key': {
        const ro = Array.isArray(row.recharge_orders)
          ? (row.recharge_orders[0] as Record<string, unknown> | undefined)
          : (row.recharge_orders as Record<string, unknown> | null)
        const prof = Array.isArray(row.profiles)
          ? (row.profiles[0] as Record<string, unknown> | undefined)
          : (row.profiles as Record<string, unknown> | null)

        const raw = config.id === 'origin_country'
          ? (prof?.country ?? meta?.origin_country ?? meta?.user_country ?? meta?.origin_country_code ?? 'UNKNOWN')
          : (ro?.country_iso ?? meta?.country_id ?? meta?.destination_country_code ?? meta?.country_iso2 ?? 'UNKNOWN')

        const code = String(raw ?? 'UNKNOWN').toUpperCase().trim()
        r[groupKey]       = code
        r['country_name'] = String(
          meta?.destination_country_name ?? meta?.country_name ?? code
        )
        r['iso2'] = code.length === 2 ? code : code
        r['_amount']  = n(row.amount)
        r['_success'] = row.status === 'completed' || row.status === 'success' ? 1 : 0
        r['_failed']  = row.status === 'failed' || row.status === 'error' ? 1 : 0
        r['_operator'] = String(ro?.operator_name ?? meta?.operator_name ?? 'unknown')
        r['_provider'] = resolveProviderFromRow(row, providerIndex).label
        break
      }

      // Financial period — same source/rules as Admin Dashboard (recharge_orders + txn)
      case '_period_key': {
        r[groupKey] = String(row.created_at ?? '').slice(0, 7)
        r['day']    = String(row.created_at ?? '').slice(0, 10)
        r['period'] = r[groupKey]

        // Prefer precomputed ITU fields (Dashboard-aligned); fall back to legacy txn fields
        if (row._itu_gross != null || row._itu_cost != null || row._itu_refund != null) {
          const grossEur = n(row._itu_gross)
          const isCompleted = n(row._itu_gross) > 0 || String(row.status).toLowerCase() === 'completed'
          r['_gross']  = grossEur
          r['_cost']   = n(row._itu_cost)
          r['_refund'] = n(row._itu_refund)

          const txn = unwrapTransaction(row as ItuRechargeRow)
          const txnMeta = txn?.metadata as Record<string, unknown> | null | undefined
          const isWallet =
            String(txnMeta?.payment_method ?? meta?.payment_method).toLowerCase() === 'wallet' ||
            String(txnMeta?.gateway ?? meta?.gateway).toLowerCase() === 'wallet'
          r['_gateway_fee']  = computePaymentGatewayFee(grossEur, isWallet)
          r['_wallet_usage'] = (isCompleted && isWallet) ? grossEur : 0
          r['_tax']          = (isCompleted && grossEur > 0) ? parseFloat((grossEur * 0.05).toFixed(2)) : 0
        } else {
          const isCompleted = row.status === 'completed'
          const isRefunded  = row.status === 'refunded' || row.status === 'cancelled'
          const amountEur   = n(row.amount)

          r['_gross']        = isCompleted ? amountEur : 0
          r['_cost']         = isCompleted ? (n(meta?.selected_provider_cost) ||
                          n((meta?.lcr_result as Record<string,unknown>|null)?.selectedProviderCost)) : 0
          r['_refund']       = isRefunded ? amountEur : 0

          const isWallet = String(meta?.payment_method).toLowerCase() === 'wallet' || String(meta?.gateway).toLowerCase() === 'wallet'
          r['_gateway_fee']  = isCompleted ? computePaymentGatewayFee(amountEur, isWallet) : 0
          r['_wallet_usage'] = (isCompleted && isWallet) ? amountEur : 0
          r['_tax']          = isCompleted ? parseFloat((amountEur * 0.05).toFixed(2)) : 0
        }
        break
      }

      // User / customer key — group by user_id with profile identity
      case '_user_key': {
        const prof = unwrapOne(row.profiles)
        const txn = unwrapOne(row.transactions)
        const status = String(row.status ?? '').toLowerCase()
        const email = String(prof?.email ?? row.email ?? '').trim() || 'unknown'
        const userId = String(row.user_id ?? '').trim()
        r[groupKey] = userId || email.toLowerCase()
        r['_email'] = email
        r['email'] = email
        r['customer_name'] = String(prof?.name ?? '—')
        r['phone'] = String(prof?.phone ?? row.phone_number ?? '—')
        r['_app_role'] = String(prof?.app_role ?? '').toLowerCase()
        r['_country'] = String(
          prof?.country ?? row.country_iso ?? meta?.country_id ?? meta?.country ?? '—',
        ).toUpperCase()
        r['country'] = r['_country']

        const paid = n(txn?.amount ?? row.amount ?? row.send_amount)
        const isCompleted = status === 'completed'
        const isFailed = status === 'failed' || status === 'error'
        r['_amount'] = isCompleted ? paid : 0
        r['_success'] = isCompleted ? 1 : 0
        r['_failed'] = isFailed ? 1 : 0
        r['_provider'] = resolveProviderFromRow(
          {
            ...row,
            metadata: (txn?.metadata as Record<string, unknown> | null) ?? row.metadata,
            recharge_orders: row.recharge_orders ?? row,
          },
          providerIndex,
        ).label
        break
      }

      // Customer report fallback (legacy groupBy _email)
      default:
        if (config.id === 'customer' || groupKey === '_email') {
          const prof = unwrapOne(row.profiles)
          const txn = unwrapOne(row.transactions)
          const status = String(row.status ?? '').toLowerCase()
          const email = String(prof?.email ?? row.email ?? 'unknown')
          r['_email'] = email
          r[groupKey || '_email'] = email.toLowerCase()
          r['_amount'] = status === 'completed'
            ? n(txn?.amount ?? row.amount ?? row.send_amount)
            : 0
          r['_country'] = String(
            prof?.country ?? row.country_iso ?? meta?.country_id ?? '—',
          ).toUpperCase()
          r['_success'] = status === 'completed' ? 1 : 0
          r['_failed'] = status === 'failed' || status === 'error' ? 1 : 0
        }
        break
    }

    return r
  })
}

// ─── In-memory aggregation ────────────────────────────────────────────────────

function aggregate(
  rows: Record<string, unknown>[],
  cfg: AggregationConfig,
): Record<string, unknown>[] {
  const { groupByKey, labelKey, aggregates, computeAfter } = cfg
  const label = labelKey ?? groupByKey

  const buckets = new Map<string, Record<string, unknown>>()

  for (const row of rows) {
    const key = String(row[groupByKey] ?? 'unknown')
    const bucket = buckets.get(key) ?? { [groupByKey]: key, [label]: row[label] ?? row['country_name'] ?? key }

    for (const agg of aggregates) {
      const src = agg.sourceKey ?? agg.key
      const cur = n(bucket[agg.key])
      switch (agg.fn) {
        case 'count':
          bucket[agg.key] = cur + 1
          break
        case 'sum':
          bucket[agg.key] = cur + n(row[src])
          break
        case 'avg': {
          const prev = (bucket[`__avg_sum_${agg.key}`] ?? 0) as number
          const cnt  = (bucket[`__avg_cnt_${agg.key}`] ?? 0) as number
          bucket[`__avg_sum_${agg.key}`] = prev + n(row[src])
          bucket[`__avg_cnt_${agg.key}`] = cnt + 1
          bucket[agg.key] = (prev + n(row[src])) / (cnt + 1)
          break
        }
        case 'countDistinct': {
          const set = (bucket[`__set_${agg.key}`] ?? new Set()) as Set<string>
          const distinctVal = row[src]
          if (distinctVal != null && String(distinctVal).trim() !== '') {
            set.add(String(distinctVal))
          }
          bucket[`__set_${agg.key}`] = set
          bucket[agg.key] = set.size
          break
        }
        case 'first':
          if (bucket[agg.key] === undefined) bucket[agg.key] = row[src]
          break
        case 'last':
          bucket[agg.key] = row[src]
          break
        case 'min': {
          const val = row[src]
          const existing = bucket[agg.key] as any
          if (val !== undefined && val !== null && val !== '') {
            if (existing === undefined || val < existing) {
              bucket[agg.key] = val
            }
          }
          break;
        }
        case 'max': {
          const val = row[src]
          const existing = bucket[agg.key] as any
          if (val !== undefined && val !== null && val !== '') {
            if (existing === undefined || val > existing) {
              bucket[agg.key] = val
            }
          }
          break;
        }
        case 'collect': {
          const map = (bucket[`__map_${agg.key}`] ?? {}) as Record<string, number>
          const itemVal = String(row[src] ?? 'unknown')
          if (itemVal && itemVal !== 'unknown') {
            map[itemVal] = (map[itemVal] ?? 0) + 1
          }
          bucket[`__map_${agg.key}`] = map
          
          let topItem = '—'
          let topCount = -1
          for (const [k, count] of Object.entries(map)) {
            if (count > topCount) {
              topItem = k
              topCount = count
            }
          }
          bucket[agg.key] = topItem
          break
        }
        case 'percentiles': {
          const list = (bucket[`__list_${agg.key}`] ?? []) as number[]
          list.push(n(row[src]))
          bucket[`__list_${agg.key}`] = list
          
          if (list.length > 0) {
            const sorted = [...list].sort((a, b) => a - b)
            const p95Idx = Math.floor(sorted.length * 0.95)
            const p99Idx = Math.floor(sorted.length * 0.99)
            bucket[`${agg.key}_p95`] = sorted[p95Idx] ?? 0
            bucket[`${agg.key}_p99`] = sorted[p99Idx] ?? 0
            bucket[agg.key] = sorted[Math.floor(sorted.length * 0.5)] ?? 0 // median
          }
          break
        }
      }
      buckets.set(key, bucket)
    }

    buckets.set(key, bucket)
  }

  // Clean internal keys, apply computeAfter
  const result: Record<string, unknown>[] = []
  for (const bucket of buckets.values()) {
    // remove internal aggregation helpers
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(bucket)) {
      if (!k.startsWith('__')) clean[k] = v instanceof Set ? v.size : v
    }
    // apply post-aggregation computed columns
    for (const ca of computeAfter ?? []) {
      clean[ca.key] = ca.compute(clean)
    }
    result.push(clean)
  }

  return result
}

// ─── Column compute() application ─────────────────────────────────────────────

function applyComputedColumns(
  rows: Record<string, unknown>[],
  config: ReportConfig,
): ReportRow[] {
  return rows.map((raw) => {
    const row: Record<string, unknown> = { ...raw }
    for (const col of config.columns) {
      if (col.compute) {
        row[col.key] = col.compute(raw)
      }
    }
    return row
  })
}

// ─── Client-side filters ──────────────────────────────────────────────────────

function applyClientSideFilters(
  rows: ReportRow[],
  mappings: FilterMapping[],
  filters: ReportFilters,
): ReportRow[] {
  const active = mappings.filter((fm) => fm.clientSide && fm.clientFilter)
  if (active.length === 0) return rows

  return rows.filter((row) =>
    active.every((fm) => {
      const value = filters[fm.filterKey]
      if (!value) return true
      return fm.clientFilter!(row as Record<string, unknown>, String(value))
    })
  )
}

// ─── Post-aggregation / client search ─────────────────────────────────────────

const SEARCH_SKIP_KEYS = new Set([
  'metadata',
  'recharge_orders',
  'transactions',
  'profiles',
  'users',
  'admin_users',
  'totals',
  'summary_details',
  'health_metrics',
  'validation_errors',
  'reconciliation_details',
  'actions',
])

function searchableValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

/**
 * Client-side search across report rows.
 * Used for loadAll list reports (Transactions) and aggregated reports
 * (Provider / Operator / User) so UUID / nested fields still match.
 */
function applyClientSearch(
  rows: ReportRow[],
  search: string | undefined,
  config: ReportConfig,
): ReportRow[] {
  if (!search?.trim()) return rows
  const q = search.trim().toLowerCase()
  if (!q) return rows

  const columnKeys = config.columns.map((c) => c.key)
  const extraKeys = [
    ...(config.searchColumns ?? []),
    config.aggregation?.labelKey,
    config.aggregation?.groupByKey,
    'id',
    'transaction_id',
    'provider_ref',
    'email',
    'customer',
    'customer_name',
    'phone',
    'phone_number',
    'provider',
    'provider_code',
    'operator',
    'operator_name',
    'country',
    'country_iso',
    'role',
    'status',
    'recharge_status',
    'payment_status',
    'billing_period',
    'display_status',
  ].filter(Boolean) as string[]

  const keys = [...new Set([...columnKeys, ...extraKeys])].filter((k) => !SEARCH_SKIP_KEYS.has(k))

  return rows.filter((row) => {
    for (const key of keys) {
      if (searchableValue(row[key]).toLowerCase().includes(q)) return true
    }
    // Fallback: scan primitive own fields (skip nested blobs)
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith('_') && key !== '_email' && key !== '_provider_key' && key !== '_operator_key' && key !== '_user_key') {
        continue
      }
      if (SEARCH_SKIP_KEYS.has(key)) continue
      if (searchableValue(value).toLowerCase().includes(q)) return true
    }
    return false
  })
}

/** @deprecated use applyClientSearch */
function applyPostAggSearch(rows: ReportRow[], search: string | undefined, config: ReportConfig): ReportRow[] {
  return applyClientSearch(rows, search, config)
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function buildSummaryCards(
  cfgs: SummaryCardConfig[],
  allRows: ReportRow[],
): SummaryCard[] {
  return cfgs.map((cfg) => {
    let value: number | string = 0
    try { value = cfg.compute(allRows as Record<string, unknown>[]) } catch {}
    return {
      id:       cfg.id,
      label:    cfg.label,
      icon:     cfg.icon,
      value:    typeof value === 'number' ? parseFloat(value.toFixed(2)) : value,
      currency: cfg.currency,
      suffix:   cfg.suffix,
    }
  })
}

// ─── Chart series ─────────────────────────────────────────────────────────────

function buildChartData(cfgs: ChartSeriesConfig[] | undefined, rows: ReportRow[]): ChartSeries[] {
  if (!cfgs?.length) return []

  return cfgs.map((cfg) => {
    const labelMap = new Map<string, number>()
    for (const row of rows) {
      const label = String(row[cfg.labelKey] ?? 'unknown')
      const val = n(row[cfg.valueKey])
      labelMap.set(label, (labelMap.get(label) ?? 0) + (val || 1))
    }

    let data: ChartDataPoint[] = Array.from(labelMap.entries()).map(([label, value]) => ({
      label,
      value,
    }))

    // Sort descending by value (highly useful for top items charts)
    data.sort((a, b) => b.value - a.value)

    if (cfg.maxItems) {
      data = data.slice(0, cfg.maxItems)
    }

    return { id: cfg.id, name: cfg.name, type: cfg.type ?? 'bar', data }
  })
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function executeReport(
  config:  ReportConfig,
  filters: ReportFilters,
  sort:    ReportSort | undefined,
  page:    number,
  pageSize:number,
): Promise<ReportData> {
  const { dataQuery, countQuery, isAggregated, loadAll } = buildQuery(config, filters, sort, page, pageSize)

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const res = await supabaseRest(dataQuery, { cache: 'no-store' })
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`[${config.id}] Query failed (${res.status}): ${msg}`)
  }

  let rawRows: Record<string, unknown>[] = []
  try { rawRows = await res.json() } catch { rawRows = [] }
  if (!Array.isArray(rawRows)) rawRows = []

  // Financial report: use Dashboard-aligned ITU amounts (recharge_orders + txn + routing costs)
  if (config.id === 'financial') {
    const { reportingCurrency, rateMap, fallbackRates } = await loadItuRateContext()
    const routingCosts = await loadRoutingCostsForItuRows(rawRows as ItuRechargeRow[])
    rawRows = rawRows.map((row) => {
      const itu = resolveItuAmountsForRow(
        row as ItuRechargeRow,
        reportingCurrency,
        rateMap,
        fallbackRates,
        routingCosts,
      )
      return {
        ...row,
        _itu_gross:  itu.grossReporting,
        _itu_cost:   itu.costReporting,
        _itu_refund: itu.refundReporting,
      }
    })
  } else if (config.id === 'reconciliation') {
    // Rebuild money fields from line items in EUR (avoids mixed-currency totals JSON).
    const toEur = await createReportFxConverter()
    rawRows = await recomputeReconciliationTotalsInEur(rawRows, toEur)
  } else {
    // ── Convert all monetary fields to EUR (multi-currency platform) ─────────
    const toEur = await createReportFxConverter()
    rawRows = convertRawAmountsToEur(rawRows, toEur)
  }

  // ── Provider / operator catalogs for identity resolution ───────────────────
  const needsProviderIndex =
    config.aggregation?.groupByKey === '_provider_key' ||
    config.aggregation?.groupByKey === '_operator_key' ||
    config.aggregation?.groupByKey === '_user_key' ||
    config.id === 'provider' ||
    config.id === 'destination_network' ||
    config.id === 'transactions' ||
    config.id === 'reconciliation' ||
    config.id === 'customer'
  const needsOperatorCatalog =
    config.aggregation?.groupByKey === '_operator_key' ||
    config.id === 'destination_network' ||
    config.id === 'transactions'

  const [providerIndex, operatorCatalog] = await Promise.all([
    needsProviderIndex ? loadLcrProviderIndex() : Promise.resolve(undefined),
    needsOperatorCatalog ? loadOperatorCatalog() : Promise.resolve(undefined),
  ])

  // ── Inject virtual keys ────────────────────────────────────────────────────
  rawRows = injectVirtualKeys(rawRows, config, providerIndex, operatorCatalog)

  // ── Enrich list reports (flatten nested fields / resolve labels) ───────────
  rawRows = enrichReportRows(rawRows, config, providerIndex, operatorCatalog)

  // ── Client-side filters (before aggregation so provider filter applies) ─────
  rawRows = applyClientSideFilters(
    rawRows as ReportRow[],
    config.filterMappings ?? [],
    filters,
  ) as Record<string, unknown>[]

  // ── Apply column compute() on raw data ────────────────────────────────────
  let processedRows: ReportRow[] = applyComputedColumns(rawRows, config)

  let pagination: ReportPagination
  let allRowsForCards: ReportRow[]

  if (isAggregated) {
    // ── In-memory aggregation path ──────────────────────────────────────────
    let aggRows = aggregate(rawRows, config.aggregation!)
      .map((raw) => {
        const row: ReportRow = { ...raw }
        // apply post-agg column computes (for columns that compute from raw data)
        for (const col of config.columns) {
          if (col.compute && !(col.key in row)) {
            row[col.key] = col.compute(raw)
          }
        }
        return row
      })

    // Ensure every configured LCR provider appears (even with zero traffic)
    if (config.id === 'provider' && providerIndex?.list.length && !filters.provider) {
      const seen = new Set(aggRows.map((r) => String(r._provider_key ?? r.provider ?? '').toLowerCase()))
      for (const p of providerIndex.list) {
        const key = (p.code || p.name || p.id).toLowerCase()
        if (seen.has(key)) continue
        // Also treat display-name keys as already present
        if (seen.has(p.name.toLowerCase())) continue
        seen.add(key)
        aggRows.push({
          _provider_key: key,
          provider: p.name || p.code || p.id,
          provider_code: p.code || null,
          provider_id: p.id,
          orders: 0,
          success_count: 0,
          failed_count: 0,
          timeout_count: 0,
          retry_count: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          success_rate: 0,
          availability: 0,
          avg_latency: 0,
          ref_count: 0,
        })
      }
    }

    // Align User Report with Admin Customers directory; append labeled admin/staff.
    if (config.id === 'customer') {
      aggRows = await mergeCustomerDirectoryRows(aggRows)
    }

    // Search within aggregated results (Provider / Operator / User / etc.)
    aggRows = applyClientSearch(aggRows, filters.search, config)

    // Sort
    const sortCol = sort?.column ?? config.defaultSort.column
    const sortDir = sort?.direction ?? config.defaultSort.direction
    aggRows = sortRows(aggRows, sortCol, sortDir)

    const total = aggRows.length
    allRowsForCards = aggRows
    processedRows   = paginate(aggRows, page, pageSize)
    pagination      = { page, pageSize, total }

  } else if (loadAll) {
    // ── Full fetch + client pagination (accurate cards/charts) ──────────────
    // Apply search in memory so transaction IDs / phones / emails match reliably
    // (PostgREST ilike on UUID columns is unreliable).
    let allRows = applyClientSearch(processedRows, filters.search, config)
    const sortCol = sort?.column ?? config.defaultSort.column
    const sortDir = sort?.direction ?? config.defaultSort.direction
    allRows = sortRows(allRows, sortCol, sortDir)
    allRowsForCards = allRows
    const total = allRows.length
    processedRows = paginate(allRows, page, pageSize)
    pagination = { page, pageSize, total }
  } else {
    // ── Server-paginated path ───────────────────────────────────────────────
    // Still apply client search on the current page as a safety net when
    // searchColumns were empty or UUID filters were skipped server-side.
    let pageRows = applyClientSearch(processedRows, filters.search, config)
    allRowsForCards = pageRows

    // Get total count
    const total = filters.search?.trim()
      ? pageRows.length
      : await fetchCount(countQuery)
    pagination  = { page, pageSize, total: total || pageRows.length }
    processedRows = pageRows
  }

  // ── Summary cards ──────────────────────────────────────────────────────────
  if (config.id === 'reconciliation') {
    const platform = await loadPlatformItuSnapshot(filters)
    if (allRowsForCards.length > 0) {
      allRowsForCards = [
        {
          ...allRowsForCards[0],
          _platform_gross: platform.gross,
          _platform_cost: platform.cost,
          _platform_refund: platform.refund,
        },
        ...allRowsForCards.slice(1),
      ]
    } else {
      allRowsForCards = [{
        _platform_gross: platform.gross,
        _platform_cost: platform.cost,
        _platform_refund: platform.refund,
        supplier_billed: 0,
        platform_expected: 0,
        amount_difference: 0,
        net_settlement: 0,
        match_rate: 0,
        display_status: '—',
      }]
    }
  }
  const summaryCards = buildSummaryCards(config.summaryCards, allRowsForCards)

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = buildChartData(config.charts, allRowsForCards)

  return {
    rows: processedRows,
    pagination,
    summaryCards,
    chartData,
  }
}
