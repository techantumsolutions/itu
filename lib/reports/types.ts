/**
 * Core types for the ITU Reports Engine.
 * All report types are registered here — adding a new report never touches existing code.
 */

import type React from 'react'

// ─── Report Type Registry ────────────────────────────────────────────────────

export const REPORT_TYPE = {
  DASHBOARD_SUMMARY:       'dashboard_summary',
  TRANSACTIONS:            'transactions',
  COUNTRY:                 'country',
  ORIGIN_COUNTRY:          'origin_country',
  DESTINATION_COUNTRY:     'destination_country',
  DESTINATION_NETWORK:     'destination_network',
  PROVIDER:                'provider',
  FINANCIAL:               'financial',
  FAILED_RECHARGE:         'failed_recharge',
  RECONCILIATION:          'reconciliation',
  WALLET:                  'wallet',
  SETTLEMENT:              'settlement',
  CUSTOMER:                'customer',
  AUDIT:                   'audit',
} as const

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE]

// ─── Date Range ──────────────────────────────────────────────────────────────

export type DateRangePreset =
  | 'all_time'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'custom'

export interface DateRange {
  from: string   // ISO date string YYYY-MM-DD
  to:   string   // ISO date string YYYY-MM-DD
  preset?: DateRangePreset
}

// ─── Filter System ───────────────────────────────────────────────────────────

export interface ReportFilters {
  dateRange:  DateRange
  provider?:  string
  country?:   string
  destinationCountry?: string
  originCountry?: string
  network?:   string
  operator?:  string
  currency?:  string
  status?:    string // Transaction Status
  rechargeType?: string
  billingType?: string
  paymentStatus?: string
  gateway?:   string
  customer?:  string
  adminUser?: string
  minAmount?: number
  maxAmount?: number
  search?:    string
  groupBy?:   string
  [key: string]: unknown
}

// ─── Column Definition ───────────────────────────────────────────────────────

export type ColumnAlign = 'left' | 'center' | 'right'
export type ColumnType  = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'badge' | 'link'

export interface ReportColumn<TRow = Record<string, unknown>> {
  key:         string
  header:      string
  type?:       ColumnType
  align?:      ColumnAlign
  visible?:    boolean
  sortable?:   boolean
  width?:      number
  currency?:   string
  render?:     (value: unknown, row: TRow) => React.ReactNode
  exportValue?: (value: unknown, row: TRow) => string | number
}

// ─── Summary Card ────────────────────────────────────────────────────────────

export type TrendDirection = 'up' | 'down' | 'neutral'

export interface SummaryCard {
  id:          string
  label:       string
  value:       string | number
  trend?:      number          // percentage change vs previous period
  trendDir?:   TrendDirection
  icon?:       string          // lucide icon name
  currency?:   string
  suffix?:     string
  description?: string
}

// ─── Report Data ─────────────────────────────────────────────────────────────

export interface ReportRow {
  [key: string]: unknown
}

export interface ReportPagination {
  page:     number
  pageSize: number
  total:    number
}

export interface ReportSort {
  column:    string
  direction: 'asc' | 'desc'
}

export interface ReportData<TRow extends ReportRow = ReportRow> {
  rows:       TRow[]
  pagination: ReportPagination
  summaryCards?: SummaryCard[]
  chartData?:    ChartSeries[]
  meta?:         Record<string, unknown>
}

// ─── Chart Types ─────────────────────────────────────────────────────────────

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'stacked-bar' | 'heatmap'

export interface ChartDataPoint {
  label: string
  value: number
  color?: string
}

export interface ChartSeries {
  id:       string
  name:     string
  type?:    ChartType
  data:     ChartDataPoint[]
  color?:   string
}

// ─── Report Definition (registry entry) ─────────────────────────────────────

export interface ReportDefinition {
  id:          ReportType
  label:       string
  description: string
  icon:        string           // lucide icon name
  category:    ReportCategory
  columns:     ReportColumn[]
  defaultSort?: ReportSort
  defaultFilters?: Partial<ReportFilters>
  supportsGroupBy?: boolean
  supportedGroupByFields?: { value: string; label: string }[]
  supportsCharts?: boolean
  exportable?: boolean
  supportedFilters?: string[]
  defaultDateRange?: DateRangePreset
}

export type ReportCategory =
  | 'operational'
  | 'financial'
  | 'geographic'
  | 'technical'
  | 'compliance'
  | 'customer'

// ─── Export ──────────────────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'pdf'

export interface ExportOptions {
  format:     ExportFormat
  fileName?:  string
  columns?:   string[]    // subset of column keys; undefined = all visible
  filters:    ReportFilters
  sort?:      ReportSort
  reportName?: string
  generatedBy?: string
  summaryCards?: SummaryCard[]
}

// ─── API request/response ────────────────────────────────────────────────────

export interface ReportQueryParams {
  reportType: ReportType
  filters:    ReportFilters
  page:       number
  pageSize:   number
  sort?:      ReportSort
}

export interface ReportApiResponse<TRow extends ReportRow = ReportRow> {
  success: boolean
  data?:   ReportData<TRow>
  error?:  string
}
