/**
 * Query Builder — generates PostgREST URL query strings from ReportConfig + runtime params.
 *
 * Responsibilities:
 *  - SELECT columns from config (or explicit select expression)
 *  - Static filters always applied
 *  - Date range filter on the configured date column
 *  - Dynamic server-side filter mappings
 *  - Full-text search via ilike OR
 *  - ORDER BY + LIMIT/OFFSET for paginated (non-aggregated) reports
 *  - High-limit fetch for aggregated reports
 */

import type { ReportConfig, FilterMapping } from './config'
import type { ReportFilters, ReportSort } from './types'

// ─── Public API ───────────────────────────────────────────────────────────────

export interface QueryParts {
  /** Full PostgREST path+query string passed to supabaseRest() */
  dataQuery:  string
  /** Simplified query for count (no order/limit, minimal select) */
  countQuery: string
  /** Whether this report uses in-memory aggregation (skip server pagination) */
  isAggregated: boolean
  /** Fetch full result set then paginate in memory (for accurate summary cards) */
  loadAll: boolean
}

export function buildQuery(
  config: ReportConfig,
  filters: ReportFilters,
  sort: ReportSort | undefined,
  page: number,
  pageSize: number,
): QueryParts {
  const table     = config.source.table
  const select    = config.source.select
  const dateCol   = config.dateColumn ?? 'created_at'
  const isAgg     = !!config.aggregation
  const fetchLimit = config.source.fetchLimit ?? 50000
  const loadAll = isAgg || (config.source.fetchLimit != null && config.source.fetchLimit >= 10000)

  // ── Build filter string ──────────────────────────────────────────────────
  const filterParts: string[] = []

  // Static filters
  if (config.source.staticFilters) {
    filterParts.push(...config.source.staticFilters)
  }

  // Date range
  if (filters.dateRange?.from) {
    filterParts.push(`${dateCol}=gte.${filters.dateRange.from}T00:00:00Z`)
    filterParts.push(`${dateCol}=lte.${filters.dateRange.to}T23:59:59Z`)
  }

  // Dynamic filter mappings (server-side only)
  for (const fm of serverSideFilters(config.filterMappings ?? [], filters)) {
    filterParts.push(fm)
  }

  // Search — only push to PostgREST when NOT loadAll.
  // loadAll reports (Transactions, Provider, Operator, User, …) search in memory
  // after enrichment so transaction IDs / emails / resolved names all match.
  // Skip UUID columns — ilike on uuid often 400s in PostgREST.
  if (!loadAll && filters.search?.trim() && config.searchColumns?.length) {
    const term = encodeURIComponent(filters.search.trim())
    const textCols = config.searchColumns.filter((col) => {
      const c = col.toLowerCase()
      return c !== 'id' && !c.endsWith('_id') && !c.includes('.')
    })
    if (textCols.length > 0) {
      const orParts = textCols
        .map((col) => `${col}.ilike.*${term}*`)
        .join(',')
      filterParts.push(`or=(${orParts})`)
    }
  }

  const filterStr = filterParts.join('&')

  // ── Data query ───────────────────────────────────────────────────────────
  let dataQuery = `${table}?select=${encodeSelect(select)}`
  if (filterStr) dataQuery += `&${filterStr}`

  const sortCol = sort?.column ?? config.defaultSort.column
  const sortDir = sort?.direction ?? config.defaultSort.direction

  if (loadAll) {
    // Fetch all data; aggregation / client pagination happens in memory.
    // Aggregated reports must not ORDER BY computed keys (e.g. ltv) — use date column.
    if (isAgg) {
      dataQuery += `&order=${dateCol}.desc&limit=${fetchLimit}`
    } else {
      dataQuery += `&order=${sortCol}.${sortDir}&limit=${fetchLimit}`
    }
  } else {
    // Server-side sort + pagination
    dataQuery += `&order=${sortCol}.${sortDir}`
    dataQuery += `&limit=${pageSize}&offset=${(page - 1) * pageSize}`
  }

  // ── Count query (HEAD + Prefer: count=exact) ─────────────────────────────
  // Use minimal select to reduce data transfer
  let countQuery = `${table}?select=id`
  if (filterStr) countQuery += `&${filterStr}`

  return { dataQuery, countQuery, isAggregated: isAgg, loadAll }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build PostgREST filter strings for non-clientSide filter mappings. */
function serverSideFilters(
  mappings: FilterMapping[],
  filters: ReportFilters,
): string[] {
  const parts: string[] = []
  const mappedKeys = new Set<string>()

  // 1. Apply explicit mappings
  for (const fm of mappings) {
    mappedKeys.add(fm.filterKey)
    if (fm.clientSide) continue
    const value = filters[fm.filterKey]
    if (value === undefined || value === null || value === '') continue
    const op  = fm.operator ?? 'eq'
    const val = encodeURIComponent(String(value))
    parts.push(`${fm.column}=${op}.${val}`)
  }

  // 2. Apply dynamic minAmount/maxAmount if they are not explicitly mapped
  if (!mappedKeys.has('minAmount') && filters.minAmount !== undefined && filters.minAmount !== null && filters.minAmount !== '') {
    parts.push(`amount=gte.${encodeURIComponent(String(filters.minAmount))}`)
  }
  if (!mappedKeys.has('maxAmount') && filters.maxAmount !== undefined && filters.maxAmount !== null && filters.maxAmount !== '') {
    parts.push(`amount=lte.${encodeURIComponent(String(filters.maxAmount))}`)
  }

  // 3. Auto-map standard filters that were not explicitly mapped
  // Skip country filters here — they are not real transactions columns.
  // Country reports use /api/admin/reports/country which applies them in-memory.
  const standardMappings: Record<string, { col: string; op: FilterOperator }> = {
    status:             { col: 'status', op: 'eq' },
    currency:           { col: 'currency', op: 'eq' },
    network:            { col: 'network_name', op: 'eq' },
    operator:           { col: 'operator_name', op: 'eq' },
    billingType:        { col: 'billing_type', op: 'eq' },
    paymentStatus:      { col: 'payment_status', op: 'eq' },
    gateway:            { col: 'gateway', op: 'eq' },
    rechargeType:       { col: 'recharge_type', op: 'eq' },
    adminUser:          { col: 'admin_email', op: 'eq' },
  }

  for (const [key, value] of Object.entries(filters)) {
    if (
      key === 'dateRange' ||
      key === 'search' ||
      key === 'groupBy' ||
      key === 'minAmount' ||
      key === 'maxAmount' ||
      key === 'country' ||
      key === 'destinationCountry' ||
      key === 'originCountry' ||
      key === 'provider' ||
      mappedKeys.has(key)
    ) continue

    if (value === undefined || value === null || value === '') continue

    const std = standardMappings[key]
    if (std) {
      parts.push(`${std.col}=${std.op}.${encodeURIComponent(String(value))}`)
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}=eq.${encodeURIComponent(String(value))}`)
    }
  }

  return parts
}

/**
 * PostgREST select expressions contain embedded resource syntax like
 * "id,users(email)" — we must NOT encode the parens/commas.
 * Only encode if the string doesn't already contain special chars.
 */
function encodeSelect(select: string): string {
  // If it already contains parens/colons (embedded resources), pass as-is
  if (/[():]/.test(select)) return select
  return encodeURIComponent(select)
}
