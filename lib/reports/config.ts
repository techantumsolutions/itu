/**
 * ReportConfig — the single source of truth for every report.
 *
 * Defining a new report = creating one ReportConfig object.
 * The engine reads it and automatically:
 *   - builds the PostgREST SQL query
 *   - applies filters / date range / search / sort / pagination
 *   - aggregates data in memory when group-by is active
 *   - computes summary cards
 *   - builds chart series
 *
 * No switch statements, no per-report fetchers.
 */

import type React from 'react'
import type {
  ReportType,
  ReportCategory,
  ColumnType,
  ColumnAlign,
  ChartType,
  DateRangePreset,
  ReportSort,
  ReportFilters,
  ReportDefinition,
  ReportColumn,
} from './types'

// ─── Source ──────────────────────────────────────────────────────────────────

export interface ReportSourceConfig {
  /** Primary Supabase/PostgREST table */
  table: string
  /**
   * PostgREST select expression.
   * Supports embedded resources: "id,created_at,users(email)"
   * If omitted, all columns from `columns` that have no `compute` fn are selected.
   */
  select: string
  /**
   * Static PostgREST filter strings always applied (no leading &).
   * e.g. ["type=eq.recharge", "status=neq.draft"]
   */
  staticFilters?: string[]
  /** Maximum rows to fetch for aggregated reports (default 50000). */
  fetchLimit?: number
}

// ─── Filter Mapping ──────────────────────────────────────────────────────────

export type FilterOperator = 'eq' | 'neq' | 'ilike' | 'in' | 'gte' | 'lte' | 'is'

export interface FilterMapping {
  /** Key in the ReportFilters object (e.g. "provider", "status") */
  filterKey: string
  /**
   * DB column the filter maps to.
   * Use PostgREST syntax for JSON columns: "metadata->>selected_provider"
   */
  column: string
  operator?: FilterOperator
  /**
   * If true, this filter is applied in-memory after the query
   * instead of being pushed into the URL (needed for computed/JSON fields).
   */
  clientSide?: boolean
  /** Used only when clientSide=true. Receives the raw row and filter value. */
  clientFilter?: (row: Record<string, unknown>, value: string) => boolean
}

// ─── Column ───────────────────────────────────────────────────────────────────

export interface ReportColumnConfig {
  key:        string
  header:     string
  /** Actual DB column name; defaults to key. Used only when no `compute` fn. */
  dbColumn?:  string
  type?:      ColumnType
  align?:     ColumnAlign
  sortable?:  boolean
  visible?:   boolean
  currency?:  string
  width?:     number
  /**
   * In-memory transform applied after the query.
   * Receives the raw PostgREST row (all columns) and returns the display value.
   */
  compute?:   (row: Record<string, unknown>) => unknown
  /** Used by the export service to serialize this cell. */
  exportValue?: (value: unknown, row: Record<string, unknown>) => string | number
  /** Custom cell renderer (client component only). */
  render?:    (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export type AggregateFn = 'sum' | 'count' | 'avg' | 'countDistinct' | 'first' | 'last' | 'collect' | 'percentiles' | 'min' | 'max'

export interface AggregateField {
  /** Output key in the grouped row */
  key: string
  fn:  AggregateFn
  /** Source key from the raw row; defaults to `key` */
  sourceKey?: string
}

export interface AggregationConfig {
  /**
   * Key in the raw row to group by.
   * This becomes the `labelKey` and is preserved in the output.
   */
  groupByKey:  string
  /** Output key for the group label. Defaults to `groupByKey`. */
  labelKey?:   string
  aggregates:  AggregateField[]
  /**
   * Computed columns derived AFTER aggregation.
   * e.g. margin_pct = (margin / revenue) * 100
   */
  computeAfter?: {
    key:     string
    compute: (row: Record<string, unknown>) => unknown
  }[]
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

export interface SummaryCardConfig {
  id:       string
  label:    string
  icon:     string
  currency?: string
  suffix?:  string
  /**
   * Receives ALL rows from the result set (pre-pagination).
   * Return the card value.
   */
  compute:  (rows: Record<string, unknown>[]) => number | string
}

// ─── Charts ───────────────────────────────────────────────────────────────────

export interface ChartSeriesConfig {
  id:         string
  name:       string
  /** Row key to use as the X-axis / pie label */
  labelKey:   string
  /** Row key to use as the numeric value */
  valueKey:   string
  type?:      ChartType
  /** Limit data points shown (default: 20) */
  maxItems?:  number
}

// ─── Master Config ────────────────────────────────────────────────────────────

export interface ReportConfig {
  // ── Identity (also drives the UI sidebar) ────────────────────────────────
  id:          ReportType
  name:        string
  description: string
  icon:        string         // lucide icon name
  category:    ReportCategory

  // ── Data source ──────────────────────────────────────────────────────────
  source: ReportSourceConfig

  /**
   * Column used for date-range filtering.
   * Defaults to "created_at".
   */
  dateColumn?: string

  /**
   * Columns to match against `filters.search` with ilike.
   * e.g. ["id", "metadata->>user_email"]
   */
  searchColumns?: string[]

  /** Server-side OR client-side filter mappings */
  filterMappings?: FilterMapping[]

  /**
   * When defined, the engine fetches all rows (up to `fetchLimit`)
   * and groups them in memory.
   */
  aggregation?: AggregationConfig

  // ── Display ───────────────────────────────────────────────────────────────
  columns:      ReportColumnConfig[]
  summaryCards: SummaryCardConfig[]
  charts?:      ChartSeriesConfig[]

  // ── Group-by exposed to UI ────────────────────────────────────────────────
  groupByFields?: { value: string; label: string }[]

  // ── Defaults ──────────────────────────────────────────────────────────────
  defaultSort:       ReportSort
  defaultDateRange?: DateRangePreset
  defaultPageSize?:  number

  // ── Options ───────────────────────────────────────────────────────────────
  exportable?:    boolean
  supportsCharts?: boolean
  supportsGroupBy?: boolean
  supportedFilters?: string[]
}

// ─── Derive ReportDefinition for the UI layer ─────────────────────────────────
// This keeps the existing frontend components working with zero changes.

export function toReportDefinition(cfg: ReportConfig): ReportDefinition {
  const columns: ReportColumn[] = cfg.columns.map((c) => ({
    key:         c.key,
    header:      c.header,
    type:        c.type,
    align:       c.align,
    visible:     c.visible,
    sortable:    c.sortable,
    width:       c.width,
    currency:    c.currency,
    render:      c.render as ((value: unknown, row: Record<string, unknown>) => React.ReactNode) | undefined,
    exportValue: c.exportValue as ((value: unknown, row: Record<string, unknown>) => string | number) | undefined,
  }))

  return {
    id:                     cfg.id,
    label:                  cfg.name,
    description:            cfg.description,
    icon:                   cfg.icon,
    category:               cfg.category,
    columns,
    defaultSort:            cfg.defaultSort,
    defaultFilters:         cfg.defaultDateRange
      ? { dateRange: { from: '', to: '', preset: cfg.defaultDateRange } }
      : undefined,
    supportsGroupBy:        cfg.supportsGroupBy ?? false,
    supportedGroupByFields: cfg.groupByFields,
    supportsCharts:         cfg.supportsCharts ?? false,
    exportable:             cfg.exportable ?? true,
    supportedFilters:       cfg.supportedFilters ?? [],
    defaultDateRange:       cfg.defaultDateRange,
  }
}
