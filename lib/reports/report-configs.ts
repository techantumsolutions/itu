/**
 * All report configurations in one file.
 *
 * To add a new report:
 *   1. Add its ID to REPORT_TYPE in types.ts
 *   2. Create a ReportConfig object below
 *   3. Register it in ALL_REPORT_CONFIGS
 *
 * That's it. The engine, UI, sidebar, and API all adapt automatically.
 */

import React from 'react'
import type { ReportConfig } from './config'
import { REPORT_TYPE } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  const num = Number(v)
  return Number.isFinite(num) ? num : 0
}

function pct(numerator: number, denominator: number, decimals = 1): number {
  return denominator > 0 ? parseFloat(((numerator / denominator) * 100).toFixed(decimals)) : 0
}

// ─── 1. Dashboard Summary ─────────────────────────────────────────────────────

const DASHBOARD_SUMMARY: ReportConfig = {
  id:          REPORT_TYPE.DASHBOARD_SUMMARY,
  name:        'Dashboard Summary',
  description: 'High-level KPIs across revenue, orders, providers, and customers.',
  icon:        'LayoutDashboard',
  category:    'operational',
  supportsCharts: true,
  exportable: true,

  source: {
    table:  'transactions',
    select: 'id,status,amount,currency,created_at',
    staticFilters: ['type=eq.recharge', 'status=neq.pending_payment'],
    fetchLimit: 50000,
  },
  dateColumn: 'created_at',

  aggregation: {
    groupByKey: 'status',
    labelKey:   'metric',
    aggregates: [
      { key: 'orders', fn: 'count' },
      { key: 'revenue', fn: 'sum', sourceKey: 'amount' },
    ],
  },

  columns: [
    { key: 'metric',  header: 'Metric',    type: 'text',    sortable: false },
    { key: 'orders',  header: 'Orders',    type: 'number',  align: 'right', sortable: true },
    { key: 'revenue', header: 'Revenue',   type: 'currency',align: 'right', sortable: true, currency: 'EUR' },
  ],

  summaryCards: [
    {
      id: 'total', label: 'Total Orders', icon: 'FileSpreadsheet',
      compute: (rows) => rows.reduce((s, r) => s + n(r.orders), 0),
    },
    {
      id: 'revenue', label: 'Gross Revenue', icon: 'TrendingUp', currency: 'EUR',
      compute: (rows) => parseFloat(rows.filter(r => String(r.metric) === 'completed').reduce((s, r) => s + n(r.revenue), 0).toFixed(2)),
    },
    {
      id: 'success', label: 'Success Rate', icon: 'CheckCircle2', suffix: '%',
      compute: (rows) => {
        const total = rows.reduce((s, r) => s + n(r.orders), 0)
        const ok    = rows.filter(r => String(r.metric) === 'completed').reduce((s, r) => s + n(r.orders), 0)
        return pct(ok, total)
      },
    },
    {
      id: 'failed', label: 'Failed', icon: 'AlertTriangle',
      compute: (rows) => rows.filter(r => String(r.metric) === 'failed').reduce((s, r) => s + n(r.orders), 0),
    },
  ],

  charts: [
    { id: 'by_status', name: 'Orders by Status', labelKey: 'metric', valueKey: 'orders', type: 'pie' },
  ],

  supportedFilters: ['search'],
  defaultSort: { column: 'orders', direction: 'desc' },
  defaultDateRange: 'last_30_days',
}

// ─── 2. Transactions ──────────────────────────────────────────────────────────

const TRANSACTIONS: ReportConfig = {
  id:          REPORT_TYPE.TRANSACTIONS,
  name:        'Transaction Report',
  description: 'Full recharge transaction log with provider, operator, cost, and status.',
  icon:        'FileSpreadsheet',
  category:    'operational',
  supportsCharts: true,
  exportable:  true,

  source: {
    table:  'recharge_orders',
    select: 'id,created_at,status,payment_status,phone_number,operator_name,operator_code,country_iso,provider,provider_ref,failure_reason,send_amount,send_currency,receive_amount,receive_currency,user_id,transaction_id,metadata,profiles(email,name,phone,country),transactions(id,amount,currency,status,metadata,created_at)',
    staticFilters: ['status=neq.pending_payment'],
    fetchLimit: 50000,
  },
  dateColumn: 'created_at',
  searchColumns: ['id', 'phone_number', 'provider', 'operator_name', 'transaction_id', 'provider_ref'],

  filterMappings: [
    { filterKey: 'status', column: 'status', operator: 'eq' },
    {
      filterKey: 'provider',
      column: 'provider',
      clientSide: true,
      clientFilter: (row, val) => {
        const needle = String(val).toLowerCase()
        return [row.provider, row.provider_code, row.provider_ref].some((v) =>
          String(v ?? '').toLowerCase().includes(needle),
        )
      },
    },
    {
      filterKey: 'destinationCountry',
      column: 'country_iso',
      clientSide: true,
      clientFilter: (row, val) => String(row.country ?? row.country_iso ?? '').toUpperCase().includes(String(val).toUpperCase()),
    },
    {
      filterKey: 'operator',
      column: 'operator_name',
      clientSide: true,
      clientFilter: (row, val) => String(row.operator ?? row.operator_name ?? '').toLowerCase().includes(String(val).toLowerCase()),
    },
  ],

  columns: [
    { key: 'transaction_id',  header: 'Transaction ID',   type: 'text',     sortable: true },
    { key: 'created_at',      header: 'Date',             type: 'datetime', sortable: true },
    { key: 'customer',        header: 'Customer',         type: 'text',     sortable: true },
    { key: 'phone_number',    header: 'Phone Number',     type: 'text',     sortable: true },
    { key: 'country',         header: 'Country',          type: 'badge',    sortable: true },
    { key: 'operator',        header: 'Operator',         type: 'text',     sortable: true },
    { key: 'provider',        header: 'Provider',         type: 'badge',    sortable: true },
    { key: 'provider_ref',    header: 'Provider Ref',     type: 'text',     sortable: false },
    { key: 'currency',        header: 'Paid Currency',    type: 'text',     sortable: true },
    { key: 'customer_paid',   header: 'Customer Paid (EUR)', type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'provider_cost',   header: 'Provider Cost (EUR)', type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'profit',          header: 'Profit (EUR)',     type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'payment_status',  header: 'Payment Status',   type: 'badge',    sortable: true },
    { key: 'recharge_status', header: 'Recharge Status',  type: 'badge',    sortable: true },
  ],

  summaryCards: [
    { id: 'total',     label: 'Total Recharges',   icon: 'FileSpreadsheet',
      compute: (rows) => rows.length },
    { id: 'revenue',   label: 'Completed Revenue', icon: 'DollarSign', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s, r) => s + (n(r._is_completed) ? n(r.customer_paid) : 0), 0).toFixed(2)) },
    { id: 'success',   label: 'Successful',         icon: 'CheckCircle2',
      compute: (rows) => rows.filter((r) => n(r._is_completed) === 1 || String(r.recharge_status).toLowerCase() === 'completed').length },
    { id: 'failed',    label: 'Failed',             icon: 'XCircle',
      compute: (rows) => rows.filter((r) => n(r._is_failed) === 1 || String(r.recharge_status).toLowerCase() === 'failed').length },
    { id: 'pending',   label: 'Pending',            icon: 'Clock',
      compute: (rows) => rows.filter((r) => n(r._is_pending) === 1).length },
    { id: 'refund',    label: 'Refunded',           icon: 'Undo2',
      compute: (rows) => rows.filter((r) => n(r._is_refunded) === 1 || String(r.recharge_status).toLowerCase() === 'refunded').length },
  ],

  charts: [
    { id: 'by_status', name: 'Recharges by Status', labelKey: 'recharge_status', valueKey: 'customer_paid', type: 'pie' },
    { id: 'by_provider', name: 'Revenue by Provider', labelKey: 'provider', valueKey: 'customer_paid', type: 'bar', maxItems: 10 },
    { id: 'by_country', name: 'Revenue by Country', labelKey: 'country', valueKey: 'customer_paid', type: 'bar', maxItems: 10 },
    { id: 'by_operator', name: 'Revenue by Operator', labelKey: 'operator', valueKey: 'customer_paid', type: 'bar', maxItems: 10 },
  ],

  supportedFilters: [
    'provider',
    'status',
    'search',
    'destinationCountry',
    'operator',
  ],
  defaultSort: { column: 'created_at', direction: 'desc' },
  defaultDateRange: 'all_time',
}

// ─── 3. Country ───────────────────────────────────────────────────────────────

const COUNTRY: ReportConfig = {
  id:          REPORT_TYPE.COUNTRY,
  name:        'Country Report',
  description: 'Revenue, success rate, and network margin aggregated by country.',
  icon:        'Globe',
  category:    'geographic',
  supportsCharts: true,
  exportable:  true,

  source: {
    table: 'transactions',
    select: 'amount,status,currency,metadata,created_at,user_id,profiles(country),recharge_orders(country_iso,operator_name,provider,send_amount,metadata)',
    staticFilters: ['type=eq.recharge', 'status=neq.pending_payment'],
    fetchLimit: 50000,
  },
  dateColumn: 'created_at',

  aggregation: {
    groupByKey: '_country_key',
    labelKey:   'country_name',
    aggregates: [
      { key: 'orders',        fn: 'count' },
      { key: 'success_count', fn: 'sum', sourceKey: '_success' },
      { key: 'failed_count',  fn: 'sum', sourceKey: '_failed' },
      { key: 'revenue',       fn: 'sum', sourceKey: '_amount' },
      { key: 'avg_recharge',  fn: 'avg', sourceKey: '_amount' },
      { key: 'top_operator',  fn: 'collect', sourceKey: '_operator' },
      { key: 'top_provider',  fn: 'collect', sourceKey: '_provider' },
    ],
    computeAfter: [
      { key: 'country_code', compute: (r) => String(r._country_key ?? '').toUpperCase() },
      { key: 'iso2',         compute: (r) => String(r._country_key ?? '').toUpperCase() },
      { key: 'total_txns',   compute: (r) => n(r.orders) },
      { key: 'success_rate', compute: (r) => pct(n(r.success_count), n(r.orders)) },
      { key: 'failure_rate', compute: (r) => pct(n(r.failed_count), n(r.orders)) },
      { key: 'avg_recharge', compute: (r) => parseFloat(n(r.avg_recharge).toFixed(2)) },
    ],
  },

  columns: [
    { key: 'country_flag',    header: 'Flag',               type: 'text',     sortable: false, align: 'center' },
    { key: 'country_name',    header: 'Country Name',       type: 'text',     sortable: true,  align: 'left' },
    { key: 'iso2',            header: 'ISO Code',           type: 'text',     sortable: true,  align: 'center' },
    { key: 'currency_code',   header: 'Currency',           type: 'text',     sortable: true,  align: 'center' },
    { key: 'total_users',     header: 'Total Users',        type: 'number',   sortable: true,  align: 'right' },
    { key: 'total_operators', header: 'Total Operators',    type: 'number',   sortable: true,  align: 'right' },
    { key: 'total_providers', header: 'Total Providers',    type: 'number',   sortable: true,  align: 'right' },
    { key: 'total_plans',     header: 'Total Recharge Plans', type: 'number', sortable: true,  align: 'right' },
    { key: 'total_txns',      header: 'Total Transactions', type: 'number',   sortable: true,  align: 'right' },
    { key: 'success_count',   header: 'Successful',         type: 'number',   sortable: true,  align: 'right' },
    { key: 'failed_count',    header: 'Failed',             type: 'number',   sortable: true,  align: 'right' },
    { key: 'pending_count',   header: 'Pending',            type: 'number',   sortable: true,  align: 'right' },
    { key: 'success_rate',    header: 'Success %',          type: 'percent',  sortable: true,  align: 'right' },
    { key: 'revenue',         header: 'Revenue',            type: 'currency', sortable: true,  align: 'right', currency: 'EUR' },
    { key: 'provider_cost',   header: 'Provider Cost',      type: 'currency', sortable: true,  align: 'right', currency: 'EUR' },
    { key: 'profit',          header: 'Profit',             type: 'currency', sortable: true,  align: 'right', currency: 'EUR' },
    { key: 'avg_recharge',    header: 'Average Recharge',   type: 'currency', sortable: true,  align: 'right', currency: 'EUR' },
    { key: 'top_operator',    header: 'Top Operator',       type: 'text',     sortable: true },
    { key: 'top_provider',    header: 'Top Provider',       type: 'badge',    sortable: true },
    { key: 'last_recharge',   header: 'Last Recharge Date', type: 'datetime', sortable: true },
  ],

  summaryCards: [
    { id: 'total_countries',             label: 'Total Countries',             icon: 'Globe',          compute: () => 0 },
    { id: 'top_country',                 label: 'Top Country',                 icon: 'Trophy',         compute: () => '—' },
    { id: 'highest_revenue_country',     label: 'Highest Revenue Country',     icon: 'DollarSign',     compute: () => '—' },
    { id: 'highest_transaction_country', label: 'Highest Transaction Country', icon: 'ArrowRightLeft', compute: () => '—' },
    { id: 'highest_success_rate',        label: 'Highest Success Rate',        icon: 'TrendingUp',     compute: () => '—' },
    { id: 'lowest_success_rate',         label: 'Lowest Success Rate',         icon: 'TrendingDown',   compute: () => '—' },
    { id: 'average_recharge',            label: 'Average Recharge',            icon: 'CreditCard',     currency: 'EUR', compute: () => 0 },
    { id: 'active_networks',             label: 'Active Networks',             icon: 'Signal',         compute: () => 0 },
  ],

  charts: [
    { id: 'revenue_by_country',   name: 'Revenue by Country',          labelKey: 'country_name', valueKey: 'revenue',      type: 'bar' },
    { id: 'txns_by_country',      name: 'Transactions by Country',     labelKey: 'country_name', valueKey: 'total_txns',   type: 'bar' },
    { id: 'success_rate_country', name: 'Success Rate by Country',     labelKey: 'country_name', valueKey: 'success_rate', type: 'bar' },
    { id: 'profit_by_country',    name: 'Top Countries by Profit',     labelKey: 'country_name', valueKey: 'profit',       type: 'bar' },
    { id: 'trend',                name: 'Country Transaction Trend',   labelKey: 'label',        valueKey: 'value',        type: 'line' },
  ],

  supportedFilters: ['search'],
  defaultSort: { column: 'revenue', direction: 'desc' },
  defaultDateRange: 'all_time',
}

// ─── 4. Origin Country ────────────────────────────────────────────────────────

const ORIGIN_COUNTRY: ReportConfig = {
  ...COUNTRY,
  id:          REPORT_TYPE.ORIGIN_COUNTRY,
  name:        'Origin Country Report',
  description: 'Where customers are buying from — top origin markets.',
  icon:        'MapPin',
  supportedFilters: ['originCountry', 'search'],
}

// ─── 5. Destination Country ───────────────────────────────────────────────────

const DESTINATION_COUNTRY: ReportConfig = {
  ...COUNTRY,
  id:          REPORT_TYPE.DESTINATION_COUNTRY,
  name:        'Destination Country Report',
  description: 'Top-up destination countries — where the money is sent.',
  icon:        'Navigation',
  supportedFilters: ['destinationCountry', 'search'],
}

// ─── 6. Destination Network / Operator Report ─────────────────────────────────

const DESTINATION_NETWORK: ReportConfig = {
  id:          REPORT_TYPE.DESTINATION_NETWORK,
  name:        'Operator Report',
  description: 'Country-wise operator performance, provider mappings, success rates, and revenue.',
  icon:        'Signal',
  category:    'geographic',
  supportsCharts: true,
  exportable: true,

  source: {
    table: 'transactions',
    select: 'id,status,amount,currency,created_at,metadata,recharge_orders(operator_name,operator_code,country_iso,provider,status,failure_reason,receive_amount,metadata)',
    staticFilters: ['type=eq.recharge', 'status=neq.pending_payment'],
    fetchLimit: 50000,
  },
  dateColumn: 'created_at',

  filterMappings: [
    {
      filterKey: 'operator',
      column: 'metadata',
      clientSide: true,
      clientFilter: (row, value) => {
        const needle = String(value).toLowerCase()
        return [
          row.operator_name,
          row._operator_key,
          row.operator_id,
        ].some((v) => String(v ?? '').toLowerCase().includes(needle))
      },
    },
    {
      filterKey: 'network',
      column: 'metadata',
      clientSide: true,
      clientFilter: (row, value) => {
        const needle = String(value).toLowerCase()
        return [
          row.operator_name,
          row._operator_key,
        ].some((v) => String(v ?? '').toLowerCase().includes(needle))
      },
    },
    {
      filterKey: 'destinationCountry',
      column: 'metadata',
      clientSide: true,
      clientFilter: (row, value) => {
        const needle = String(value).toUpperCase()
        const country = String(row.country ?? row.country_iso3 ?? '').toUpperCase()
        return country === needle || country.includes(needle)
      },
    },
  ],

  aggregation: {
    groupByKey: '_operator_key',
    labelKey:   'operator_name',
    aggregates: [
      { key: 'orders',           fn: 'count' },
      { key: 'success_count',    fn: 'sum',           sourceKey: '_success' },
      { key: 'failed_count',     fn: 'sum',           sourceKey: '_failed' },
      { key: 'revenue',          fn: 'sum',           sourceKey: '_amount' },
      { key: 'cost',             fn: 'sum',           sourceKey: '_cost' },
      { key: 'providers_used',   fn: 'countDistinct', sourceKey: '_provider_key' },
      { key: 'top_provider',     fn: 'collect',       sourceKey: '_provider' },
      { key: 'country',          fn: 'first',         sourceKey: 'country' },
      { key: 'country_iso3',     fn: 'first',         sourceKey: 'country_iso3' },
      { key: 'providers_mapped', fn: 'max',           sourceKey: 'providers_mapped' },
      { key: 'operator_id',      fn: 'first',         sourceKey: 'operator_id' },
    ],
    computeAfter: [
      { key: 'operator_name', compute: (r) => String(r.operator_name ?? r._operator_key ?? 'unknown') },
      { key: 'country',       compute: (r) => String(r.country ?? r.country_iso3 ?? '—') },
      { key: 'providers_mapped', compute: (r) => Math.max(n(r.providers_mapped), n(r.providers_used)) },
      { key: 'profit',        compute: (r) => parseFloat((n(r.revenue) - n(r.cost)).toFixed(2)) },
      { key: 'success_rate',  compute: (r) => pct(n(r.success_count), n(r.orders)) },
      { key: 'fail_rate',     compute: (r) => pct(n(r.failed_count), n(r.orders)) },
    ],
  },

  columns: [
    { key: 'operator_name',    header: 'Operator',          type: 'text',     sortable: true },
    { key: 'country',          header: 'Country',           type: 'badge',    sortable: true },
    { key: 'providers_mapped', header: 'Providers Mapped',  type: 'number',   sortable: true, align: 'right' },
    { key: 'providers_used',   header: 'Providers Used',    type: 'number',   sortable: true, align: 'right' },
    { key: 'top_provider',     header: 'Top Provider',      type: 'badge',    sortable: true },
    { key: 'orders',           header: 'Recharges',         type: 'number',   sortable: true, align: 'right' },
    { key: 'success_count',    header: 'Success',           type: 'number',   sortable: true, align: 'right' },
    { key: 'failed_count',     header: 'Failed',            type: 'number',   sortable: true, align: 'right' },
    { key: 'success_rate',     header: 'Success %',         type: 'percent',  sortable: true, align: 'right' },
    { key: 'fail_rate',        header: 'Fail %',            type: 'percent',  sortable: true, align: 'right' },
    { key: 'revenue',          header: 'Revenue',           type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'cost',             header: 'Provider Cost',     type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'profit',           header: 'Profit',            type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
  ],

  summaryCards: [
    { id: 'operators', label: 'Active Operators', icon: 'Signal',
      compute: (rows) => rows.filter((r) => String(r.operator_name) !== 'unknown' && n(r.orders) > 0).length },
    { id: 'top_operator', label: 'Most Used Operator', icon: 'Trophy',
      compute: (rows) => {
        const top = [...rows].sort((a, b) => n(b.orders) - n(a.orders))[0]
        return top ? String(top.operator_name) : '—'
      }
    },
    { id: 'top_revenue', label: 'Highest Revenue Operator', icon: 'TrendingUp',
      compute: (rows) => {
        const top = [...rows].sort((a, b) => n(b.revenue) - n(a.revenue))[0]
        return top ? String(top.operator_name) : '—'
      }
    },
    { id: 'orders', label: 'Total Recharges', icon: 'FileSpreadsheet',
      compute: (rows) => rows.reduce((s, r) => s + n(r.orders), 0) },
    { id: 'revenue', label: 'Total Revenue', icon: 'DollarSign', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s, r) => s + n(r.revenue), 0).toFixed(2)) },
    { id: 'success', label: 'Avg Success Rate', icon: 'CheckCircle2', suffix: '%',
      compute: (rows) => pct(
        rows.reduce((s, r) => s + n(r.success_count), 0),
        rows.reduce((s, r) => s + n(r.orders), 0),
      )
    },
    { id: 'failed', label: 'Total Failures', icon: 'XCircle',
      compute: (rows) => rows.reduce((s, r) => s + n(r.failed_count), 0) },
    { id: 'countries', label: 'Countries Covered', icon: 'Globe',
      compute: (rows) => new Set(
        rows.map((r) => String(r.country ?? '').toUpperCase()).filter((c) => c && c !== '—'),
      ).size
    },
  ],

  charts: [
    { id: 'revenue_by_operator', name: 'Revenue by Operator', labelKey: 'operator_name', valueKey: 'revenue', type: 'bar', maxItems: 15 },
    { id: 'recharges_by_operator', name: 'Recharges by Operator (Most Used)', labelKey: 'operator_name', valueKey: 'orders', type: 'bar', maxItems: 15 },
    { id: 'success_rate', name: 'Success Rate by Operator', labelKey: 'operator_name', valueKey: 'success_rate', type: 'line', maxItems: 15 },
    { id: 'fail_rate', name: 'Fail Rate by Operator', labelKey: 'operator_name', valueKey: 'fail_rate', type: 'bar', maxItems: 15 },
    { id: 'providers_mapped', name: 'Providers Mapped per Operator', labelKey: 'operator_name', valueKey: 'providers_mapped', type: 'bar', maxItems: 15 },
  ],

  supportedFilters: ['destinationCountry', 'operator', 'network', 'search'],
  defaultSort: { column: 'orders', direction: 'desc' },
  defaultDateRange: 'all_time',
}

// ─── 7. Provider Report ───────────────────────────────────────────────────────

const PROVIDER: ReportConfig = {
  id:          REPORT_TYPE.PROVIDER,
  name:        'Provider Report',
  description: 'Performance, cost, and routing share by top-up provider.',
  icon:        'Building2',
  category:    'operational',
  supportsCharts: true,
  exportable:  true,

  source: {
    table: 'transactions',
    select: 'id,status,amount,currency,created_at,metadata,recharge_orders(provider,provider_ref,status,failure_reason,receive_amount,metadata)',
    staticFilters: ['type=eq.recharge', 'status=neq.pending_payment'],
    fetchLimit: 50000,
  },
  dateColumn: 'created_at',

  // Provider lives on recharge_orders / nested routing metadata — not a transactions column
  filterMappings: [
    {
      filterKey: 'provider',
      column: 'metadata',
      clientSide: true,
      clientFilter: (row, value) => {
        const needle = String(value).toLowerCase()
        return [
          row.provider,
          row._provider_key,
          row.provider_code,
          row.provider_id,
          row._provider_ref,
        ].some((v) => String(v ?? '').toLowerCase().includes(needle))
      },
    },
  ],

  aggregation: {
    groupByKey: '_provider_key',
    labelKey:   'provider',
    aggregates: [
      { key: 'orders',        fn: 'count' },
      { key: 'success_count', fn: 'sum',     sourceKey: '_success' },
      { key: 'failed_count',  fn: 'sum',     sourceKey: '_failed' },
      { key: 'timeout_count', fn: 'sum',     sourceKey: '_timeout' },
      { key: 'retry_count',   fn: 'sum',     sourceKey: '_retry' },
      { key: 'revenue',       fn: 'sum',     sourceKey: '_amount' },
      { key: 'cost',          fn: 'sum',     sourceKey: '_cost' },
      { key: 'latency_sum',   fn: 'sum',     sourceKey: '_latency' },
      { key: 'latency_cnt',   fn: 'count' },
      { key: 'ref_count',     fn: 'countDistinct', sourceKey: '_provider_ref' },
      { key: 'provider_code', fn: 'first',         sourceKey: 'provider_code' },
      { key: 'provider_id',   fn: 'first',         sourceKey: 'provider_id' },
    ],
    computeAfter: [
      { key: 'provider',    compute: (r) => String(r.provider ?? r._provider_key ?? 'unknown') },
      { key: 'provider_code', compute: (r) => r.provider_code ?? '—' },
      { key: 'profit',      compute: (r) => parseFloat((n(r.revenue) - n(r.cost)).toFixed(2)) },
      { key: 'success_rate',compute: (r) => pct(n(r.success_count), n(r.orders)) },
      { key: 'availability',compute: (r) => pct(n(r.success_count), n(r.orders)) },
      { key: 'avg_latency', compute: (r) => n(r.latency_cnt) > 0 ? Math.round(n(r.latency_sum) / n(r.latency_cnt)) : 0 },
      { key: 'ref_count',   compute: (r) => n(r.ref_count) },
    ],
  },

  columns: [
    { key: 'provider',      header: 'Provider',       type: 'badge',    sortable: true,
      render: (val) => React.createElement('a', {
        href: `/admin/reports?report=transactions&provider=${encodeURIComponent(String(val).toLowerCase())}`,
        className: 'text-indigo-500 hover:underline font-bold transition-all'
      }, String(val))
    },
    { key: 'provider_code', header: 'Code',           type: 'text',     sortable: true },
    { key: 'orders',        header: 'Transactions',   type: 'number',   sortable: true, align: 'right' },
    { key: 'success_count', header: 'Success',        type: 'number',   sortable: true, align: 'right' },
    { key: 'failed_count',  header: 'Failures',       type: 'number',   sortable: true, align: 'right' },
    { key: 'timeout_count', header: 'Timeouts',       type: 'number',   sortable: true, align: 'right' },
    { key: 'retry_count',   header: 'Retries',        type: 'number',   sortable: true, align: 'right' },
    { key: 'ref_count',     header: 'Provider Refs',  type: 'number',   sortable: true, align: 'right' },
    { key: 'revenue',       header: 'Revenue',        type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'cost',          header: 'Cost',           type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'profit',        header: 'Profit',         type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'avg_latency',   header: 'Avg Latency',    type: 'number',   sortable: true, align: 'right',
      exportValue: (val) => `${val}ms`,
      render: (val) => React.createElement('span', { className: 'font-mono' }, `${val}ms`)
    },
    { key: 'availability',  header: 'Availability',   type: 'percent',  sortable: true, align: 'right' },
  ],

  summaryCards: [
    { id: 'providers', label: 'Active Providers', icon: 'Building2',
      compute: (rows) => rows.filter((r) => String(r.provider ?? r._provider_key) !== 'unknown' && n(r.orders) > 0).length },
    { id: 'revenue',   label: 'Total Revenue',    icon: 'TrendingUp', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s,r) => s + n(r.revenue), 0).toFixed(2)) },
    { id: 'success',   label: 'Avg Success Rate', icon: 'CheckCircle2', suffix: '%',
      compute: (rows) => pct(rows.reduce((s,r) => s + n(r.success_count), 0), rows.reduce((s,r) => s + n(r.orders), 0)) },
    { id: 'failed',    label: 'Total Failures',   icon: 'XCircle',
      compute: (rows) => rows.reduce((s,r) => s + n(r.failed_count), 0) },
  ],

  charts: [
    { id: 'revenue_by_provider', name: 'Revenue by Provider', labelKey: 'provider', valueKey: 'revenue', type: 'pie' },
    { id: 'success_rate', name: 'Success Rate by Provider', labelKey: 'provider', valueKey: 'success_rate', type: 'line' },
    { id: 'latency', name: 'Average API Response Latency', labelKey: 'provider', valueKey: 'avg_latency', type: 'bar' },
  ],

  supportedFilters: ['provider', 'search'],
  defaultSort: { column: 'revenue', direction: 'desc' },
  defaultDateRange: 'all_time',
}

// ─── 8. Financial Report ──────────────────────────────────────────────────────

const FINANCIAL: ReportConfig = {
  id:          REPORT_TYPE.FINANCIAL,
  name:        'Financial Report',
  description: 'Revenue, cost, margin, refunds, and net P&L by period.',
  icon:        'DollarSign',
  category:    'financial',
  supportsCharts: true,
  exportable:  true,
  supportsGroupBy: true,
  groupByFields: [
    { value: 'period', label: 'Month (YYYY-MM)' },
    { value: 'day',    label: 'Day (YYYY-MM-DD)' },
  ],

  source: {
    table: 'recharge_orders',
    select: 'id,status,payment_status,created_at,transaction_id,send_amount,send_currency,receive_amount,receive_currency,transactions(amount,currency,status,metadata)',
    staticFilters: ['status=neq.pending_payment'],
    fetchLimit: 100000,
  },
  dateColumn: 'created_at',

  aggregation: {
    groupByKey:  '_period_key',
    labelKey:    'period',
    aggregates: [
      { key: 'orders',        fn: 'count' },
      { key: 'gross_revenue', fn: 'sum',          sourceKey: '_gross' },
      { key: 'provider_cost', fn: 'sum',          sourceKey: '_cost' },
      { key: 'refunds',       fn: 'sum',          sourceKey: '_refund' },
      { key: 'gateway_fees',  fn: 'sum',          sourceKey: '_gateway_fee' },
      { key: 'wallet_usage',  fn: 'sum',          sourceKey: '_wallet_usage' },
      { key: 'taxes',         fn: 'sum',          sourceKey: '_tax' },
    ],
    computeAfter: [
      // Net Revenue = Gross − Refunds − Gateway Fees
      { key: 'net_revenue',   compute: (r) => parseFloat((n(r.gross_revenue) - n(r.refunds) - n(r.gateway_fees)).toFixed(2)) },
      // ITU Revenue = Gross − Refunds − Provider Cost (same as Dashboard)
      { key: 'profit',        compute: (r) => parseFloat((n(r.gross_revenue) - n(r.refunds) - n(r.provider_cost)).toFixed(2)) },
    ],
  },

  columns: [
    { key: 'period',         header: 'Month',             type: 'text',     sortable: true },
    { key: 'day',            header: 'Day',               type: 'text',     sortable: true },
    { key: 'orders',         header: 'Orders',            type: 'number',   sortable: true, align: 'right' },
    { key: 'gross_revenue',  header: 'Gross Revenue',     type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'refunds',        header: 'Refunds',           type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'gateway_fees',   header: 'Gateway Fees',      type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'net_revenue',    header: 'Net Revenue',       type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'provider_cost',  header: 'Provider Cost',     type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'profit',         header: 'ITU Revenue',       type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'wallet_usage',   header: 'Wallet Usage',      type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'taxes',          header: 'Taxes (VAT)',       type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
  ],

  summaryCards: [
    { id: 'orders',    label: 'Total Recharges',   icon: 'FileSpreadsheet',
      compute: (rows) => rows.reduce((s,r) => s + n(r.orders), 0) },
    { id: 'revenue',   label: 'Gross Revenue',      icon: 'TrendingUp', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s,r) => s + n(r.gross_revenue), 0).toFixed(2)) },
    { id: 'refunds',   label: 'Total Refunds',      icon: 'Undo2', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s,r) => s + n(r.refunds), 0).toFixed(2)) },
    { id: 'profit',    label: 'ITU Revenue',        icon: 'DollarSign', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s,r) => s + n(r.profit), 0).toFixed(2)) },
  ],

  charts: [
    { id: 'revenue_trend', name: 'Gross vs Net Revenue Trend', labelKey: 'period', valueKey: 'gross_revenue', type: 'area' },
    { id: 'profit_trend', name: 'ITU Revenue Trend', labelKey: 'period', valueKey: 'profit', type: 'line' },
    { id: 'wallet_usage', name: 'Wallet payments share', labelKey: 'period', valueKey: 'wallet_usage', type: 'bar' },
  ],

  supportedFilters: ['currency'],
  filterMappings: [
    { filterKey: 'currency', column: 'send_currency', operator: 'eq' },
  ],
  defaultSort: { column: 'period', direction: 'desc' },
  defaultDateRange: 'all_time',
}

// ─── 9. Failed Recharges ──────────────────────────────────────────────────────

const FAILED_RECHARGE: ReportConfig = {
  id:          REPORT_TYPE.FAILED_RECHARGE,
  name:        'Failed Recharge Report',
  description: 'Failed, errored, and timed-out top-up transactions with root cause.',
  icon:        'AlertTriangle',
  category:    'operational',
  supportsCharts: true,
  exportable:  true,
  supportsGroupBy: true,
  groupByFields: [
    { value: 'provider',       label: 'Provider' },
    { value: 'country',        label: 'Country' },
    { value: 'operator',       label: 'Operator' },
    { value: 'failure_reason', label: 'Failure Reason' },
    { value: 'api_error',      label: 'API Error' },
    { value: 'timeout',        label: 'Timeout' },
    { value: 'validation_error', label: 'Validation Error' },
  ],

  source: {
    table: 'recharges',
    select: 'id,created_at,status,operator_name,country_iso,provider,failure_reason,metadata,transaction_id,transactions(amount,currency,metadata)',
    staticFilters: ['status=in.(failed,error,timeout)'],
    fetchLimit: 10000,
  },
  dateColumn: 'created_at',
  searchColumns: ['transaction_id'],

  filterMappings: [
    { filterKey: 'provider', column: 'provider', operator: 'eq' },
    { filterKey: 'country', column: 'country_iso', operator: 'eq' },
    { filterKey: 'operator', column: 'operator_name', operator: 'eq' },
  ],

  columns: [
    { key: 'created_at',        header: 'Date',             type: 'datetime', sortable: true },
    { key: 'transaction_id',    header: 'Transaction ID',   type: 'text',     sortable: false },
    { key: 'provider',          header: 'Provider',         type: 'badge',    sortable: true,
      compute: (r) => String(r.provider ?? '—')
    },
    { key: 'country',           header: 'Country',          type: 'text',     sortable: true,
      compute: (r) => String(r.country_iso ?? '—').toUpperCase()
    },
    { key: 'operator',          header: 'Operator',         type: 'text',     sortable: true,
      compute: (r) => String(r.operator_name ?? '—')
    },
    { key: 'failure_reason',    header: 'Failure Reason',   type: 'text',     sortable: true,
      compute: (r) => String(r.failure_reason ?? '—')
    },
    { key: 'api_error',         header: 'API Error',        type: 'badge',    sortable: false,
      compute: (r) => {
        const reason = String(r.failure_reason ?? '').toLowerCase()
        return (reason.includes('api') || reason.includes('provider') || reason.includes('http') || reason.includes('response')) ? 'Yes' : 'No'
      }
    },
    { key: 'timeout',           header: 'Timeout',          type: 'badge',    sortable: false,
      compute: (r) => {
        const reason = String(r.failure_reason ?? '').toLowerCase()
        return (reason.includes('timeout') || reason.includes('deadline')) ? 'Yes' : 'No'
      }
    },
    { key: 'validation_error',  header: 'Validation Error', type: 'badge',    sortable: false,
      compute: (r) => {
        const reason = String(r.failure_reason ?? '').toLowerCase()
        return (reason.includes('validation') || reason.includes('invalid') || reason.includes('bad') || reason.includes('format')) ? 'Yes' : 'No'
      }
    },
    { key: 'retry_count',       header: 'Retry Count',      type: 'number',   sortable: false, align: 'right',
      compute: (r) => {
        const txn = Array.isArray(r.transactions) ? r.transactions[0] : r.transactions
        const meta = txn?.metadata as Record<string, any> | null
        const rMeta = r.metadata as Record<string, any> | null
        return n(rMeta?.retry_count ?? meta?.retry_count ?? 0)
      }
    },
    { key: 'refund_status',     header: 'Refund Status',    type: 'badge',    sortable: false,
      compute: (r) => {
        const txn = Array.isArray(r.transactions) ? r.transactions[0] : r.transactions
        const meta = txn?.metadata as Record<string, any> | null
        const rMeta = r.metadata as Record<string, any> | null
        return String(rMeta?.refund_status ?? meta?.refund_status ?? 'No Refund')
      }
    },
    { key: 'resolution_status', header: 'Resolution',       type: 'badge',    sortable: false,
      compute: (r) => {
        const rMeta = r.metadata as Record<string, any> | null
        return String(rMeta?.resolution_status ?? rMeta?.resolved_status ?? 'unresolved')
      }
    },
    { key: 'admin_notes',       header: 'Admin Notes',      type: 'text',     sortable: false,
      compute: (r) => {
        const rMeta = r.metadata as Record<string, any> | null
        return String(rMeta?.admin_notes ?? rMeta?.notes ?? '—')
      }
    },
  ],

  summaryCards: [
    { id: 'total',    label: 'Total Failures', icon: 'AlertTriangle',
      compute: (rows) => rows.length },
    { id: 'refunded', label: 'Refunded Recharges', icon: 'Undo2',
      compute: (rows) => rows.filter(r => String(r.refund_status).toLowerCase() === 'completed' || String(r.refund_status).toLowerCase() === 'yes').length },
    { id: 'timeouts', label: 'Timeout Failures', icon: 'Clock',
      compute: (rows) => rows.filter(r => r.timeout === 'Yes').length },
  ],

  charts: [
    { id: 'failure_trend', name: 'Failure Trend', labelKey: 'created_at', valueKey: 'failures', type: 'line' },
    { id: 'top_reasons', name: 'Top Failure Reasons', labelKey: 'failure_reason', valueKey: 'failures', type: 'bar', maxItems: 10 },
    { id: 'provider_failures', name: 'Provider Failures', labelKey: 'provider', valueKey: 'failures', type: 'pie' },
    { id: 'country_failures', name: 'Country Failures', labelKey: 'country', valueKey: 'failures', type: 'bar' },
  ],

  supportedFilters: [
    'provider',
    'country',
    'destinationCountry',
    'operator',
    'network',
    'search',
  ],
  defaultSort: { column: 'created_at', direction: 'desc' },
  defaultDateRange: 'last_30_days',
}

// ─── 10. Reconciliation ───────────────────────────────────────────────────────

const RECONCILIATION: ReportConfig = {
  id:          REPORT_TYPE.RECONCILIATION,
  name:        'Reconciliation Report',
  description: 'Supplier billing vs. platform operational records, net settlement summary.',
  icon:        'Scale',
  category:    'financial',
  supportsCharts: true,
  exportable:  true,

  source: {
    table: 'reconciliation_reports',
    select: 'id,provider,period_start,period_end,billing_period,billing_type,run_version,status,settlement_status,totals,summary_details,health_metrics,validation_errors,file_name,created_at',
    fetchLimit: 10000,
  },
  dateColumn: 'created_at',

  filterMappings: [
    {
      filterKey: 'provider',
      column: 'provider',
      clientSide: true,
      clientFilter: (row, val) => {
        const needle = String(val).toLowerCase()
        return [row.provider, row.provider_code].some((v) =>
          String(v ?? '').toLowerCase().includes(needle),
        )
      },
    },
    { filterKey: 'status', column: 'status', operator: 'eq' },
  ],

  columns: [
    { key: 'billing_period',        header: 'Period',            type: 'text',     sortable: true },
    { key: 'provider',              header: 'Provider',          type: 'badge',    sortable: true },
    { key: 'billing_type',          header: 'Run Type',          type: 'badge',    sortable: true },
    { key: 'run_version',           header: 'Version',           type: 'number',   sortable: true, align: 'right' },
    { key: 'currency',              header: 'Currency',          type: 'badge',    sortable: true },
    { key: 'match_rate',            header: 'Match Rate',        type: 'percent',  sortable: true, align: 'right' },
    { key: 'auto_match_percent',    header: 'Auto Match %',      type: 'percent',  sortable: true, align: 'right' },
    { key: 'manual_review_percent', header: 'Manual Review %',   type: 'percent',  sortable: true, align: 'right' },
    { key: 'supplier_billed',       header: 'Supplier Billed (EUR)',   type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'platform_expected',     header: 'Platform Expected (EUR)', type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'amount_difference',     header: 'Cost Variance (EUR)',     type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'refunds',               header: 'Refunds (EUR)',           type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'net_settlement',        header: 'Net Settlement (EUR)',    type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'duplicate_rows',        header: 'Duplicate Rows',    type: 'number',   sortable: true, align: 'right' },
    { key: 'currency_issues',       header: 'Currency Issues',   type: 'number',   sortable: true, align: 'right' },
    { key: 'display_status',        header: 'Status',            type: 'badge',    sortable: true },
    { key: 'actions',               header: 'Actions',           type: 'text',     sortable: false,
      render: (_val, row) => {
        const id = String(row.id)
        return React.createElement('a', {
          href: '/admin/reconciliation/reports/' + id,
          className: 'text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1 px-2.5 rounded transition-all shadow-sm'
        }, 'Details')
      }
    },
  ],

  summaryCards: [
    { id: 'gross', label: 'Gross Revenue', icon: 'TrendingUp', currency: 'EUR',
      compute: (rows) => {
        const hit = rows.find((r) => r._platform_gross != null)
        return hit ? n(hit._platform_gross) : 0
      } },
    { id: 'provider_cost', label: 'Provider Cost', icon: 'Building2', currency: 'EUR',
      compute: (rows) => {
        const hit = rows.find((r) => r._platform_cost != null)
        return hit ? n(hit._platform_cost) : 0
      } },
    { id: 'billed', label: 'Supplier Billed', icon: 'Scale', currency: 'EUR',
      compute: (rows) => parseFloat(rows.filter((r) => r.id).reduce((s, r) => s + n(r.supplier_billed), 0).toFixed(2)) },
    { id: 'expected', label: 'Platform Expected', icon: 'CheckCircle2', currency: 'EUR',
      compute: (rows) => parseFloat(rows.filter((r) => r.id).reduce((s, r) => s + n(r.platform_expected), 0).toFixed(2)) },
    { id: 'variance', label: 'Total Cost Variance', icon: 'TrendingDown', currency: 'EUR',
      compute: (rows) => parseFloat(rows.filter((r) => r.id).reduce((s, r) => s + n(r.amount_difference ?? r.cost_difference), 0).toFixed(2)) },
    { id: 'settlement', label: 'Net Settlement', icon: 'DollarSign', currency: 'EUR',
      compute: (rows) => parseFloat(rows.filter((r) => r.id).reduce((s, r) => s + n(r.net_settlement), 0).toFixed(2)) },
    { id: 'matched', label: 'Avg Match Rate', icon: 'Percent', suffix: '%',
      compute: (rows) => {
        const real = rows.filter((r) => r.id)
        if (!real.length) return 0
        return parseFloat((real.reduce((s, r) => s + n(r.match_rate), 0) / real.length).toFixed(1))
      }
    },
    { id: 'open', label: 'Open Settlements', icon: 'Clock',
      compute: (rows) => rows.filter((r) => {
        if (!r.id) return false
        const s = String(r.display_status ?? r.settlement_status ?? r.status).toLowerCase()
        return s === 'open' || s === 'pending' || s === 'draft'
      }).length },
  ],

  charts: [
    { id: 'supplier_billed', name: 'Supplier Billed by Provider (EUR)', labelKey: 'provider', valueKey: 'supplier_billed', type: 'bar' },
    { id: 'platform_expected', name: 'Platform Expected by Provider (EUR)', labelKey: 'provider', valueKey: 'platform_expected', type: 'bar' },
    { id: 'cost_difference', name: 'Cost Variance by Provider (EUR)', labelKey: 'provider', valueKey: 'amount_difference', type: 'bar' },
    { id: 'net_settlement', name: 'Net Settlement by Provider (EUR)', labelKey: 'provider', valueKey: 'net_settlement', type: 'bar' },
  ],

  supportedFilters: ['provider', 'status'],
  defaultSort: { column: 'created_at', direction: 'desc' },
  defaultDateRange: 'all_time',
}

// ─── 12. Wallet ───────────────────────────────────────────────────────────────

const WALLET: ReportConfig = {
  id:          REPORT_TYPE.WALLET,
  name:        'Wallet Report',
  description: 'Customer wallet balances, top-ups, and spend activity.',
  icon:        'Wallet',
  category:    'financial',
  supportsCharts: false,
  exportable: true,

  source: {
    table:  'wallet_balances',
    select: 'user_id,currency,balance,total_credited,total_debited,updated_at,users(email)',
    fetchLimit: 5000,
  },
  dateColumn: 'updated_at',
  searchColumns: ['users.email'],

  columns: [
    { key: 'user_email',   header: 'Customer',      type: 'text',    sortable: true,
      compute: (r) => { const u = Array.isArray(r.users) ? (r.users as Record<string,unknown>[])[0] : r.users; return (u as Record<string,unknown>|null)?.email ?? '—' } },
    { key: 'currency',     header: 'Currency',      type: 'text',    sortable: true },
    { key: 'balance',      header: 'Balance',       type: 'currency',sortable: true, align: 'right', currency: 'EUR' },
    { key: 'total_topups', header: 'Total Top-ups', type: 'currency',sortable: true, align: 'right',
      compute: (r) => n(r.total_credited) },
    { key: 'total_spend',  header: 'Total Spend',   type: 'currency',sortable: true, align: 'right',
      compute: (r) => n(r.total_debited) },
    { key: 'last_activity',header: 'Last Activity', type: 'datetime',sortable: true,
      compute: (r) => r.updated_at },
  ],

  summaryCards: [
    { id: 'wallets',  label: 'Active Wallets',  icon: 'Wallet',
      compute: (rows) => rows.filter(r => n(r.balance) > 0).length },
    { id: 'balance',  label: 'Total Balance',   icon: 'DollarSign', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s,r) => s + n(r.balance), 0).toFixed(2)) },
  ],

  supportedFilters: ['currency', 'customer', 'search'],
  defaultSort: { column: 'balance', direction: 'desc' },
  defaultDateRange: 'this_month',
}

// ─── 13. Settlement ───────────────────────────────────────────────────────────

const SETTLEMENT: ReportConfig = {
  id:          REPORT_TYPE.SETTLEMENT,
  name:        'Settlement Report',
  description: 'Inter-provider settlement summaries and payment status.',
  icon:        'Banknote',
  category:    'financial',
  supportsCharts: false,
  exportable: true,

  source: {
    table:  'settlements',
    select: 'id,period,provider,gross_amount,adjustments,net_payable,settlement_status,due_date,currency',
    fetchLimit: 2000,
  },
  dateColumn: 'due_date',

  filterMappings: [
    { filterKey: 'provider', column: 'provider', operator: 'eq' },
    { filterKey: 'status',   column: 'settlement_status', operator: 'eq' },
  ],

  columns: [
    { key: 'period',            header: 'Period',            type: 'text',    sortable: true },
    { key: 'provider',          header: 'Provider',          type: 'badge',   sortable: true },
    { key: 'gross_amount',      header: 'Gross Amount',      type: 'currency',sortable: true, align: 'right', currency: 'EUR' },
    { key: 'adjustments',       header: 'Adjustments',       type: 'currency',sortable: true, align: 'right', currency: 'EUR' },
    { key: 'net_payable',       header: 'Net Payable',       type: 'currency',sortable: true, align: 'right', currency: 'EUR' },
    { key: 'settlement_status', header: 'Settlement Status', type: 'badge',   sortable: true },
    { key: 'due_date',          header: 'Due Date',          type: 'date',    sortable: true },
  ],

  summaryCards: [
    { id: 'settlements', label: 'Settlements',  icon: 'Banknote',
      compute: (rows) => rows.length },
    { id: 'net',         label: 'Net Payable',  icon: 'DollarSign', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s,r) => s + n(r.net_payable), 0).toFixed(2)) },
  ],

  supportedFilters: ['provider', 'status', 'search'],
  defaultSort: { column: 'due_date', direction: 'desc' },
  defaultDateRange: 'last_3_months',
}

// ─── 14. Customer / User Report ───────────────────────────────────────────────

const CUSTOMER: ReportConfig = {
  id:          REPORT_TYPE.CUSTOMER,
  name:        'User Report',
  description: 'Per-user recharge activity, LTV, success rates, and country profile.',
  icon:        'Users',
  category:    'customer',
  supportsCharts: true,
  exportable: true,

  source: {
    table:  'recharge_orders',
    select: 'id,status,payment_status,created_at,user_id,country_iso,provider,phone_number,send_amount,send_currency,receive_amount,metadata,profiles(email,name,phone,country,app_role),transactions(amount,currency,status,metadata)',
    staticFilters: ['status=neq.pending_payment'],
    fetchLimit: 50000,
  },
  dateColumn: 'created_at',
  searchColumns: ['email', 'customer_name', 'phone', 'country', 'role'],

  aggregation: {
    groupByKey: '_user_key',
    labelKey:   'email',
    aggregates: [
      { key: 'orders',        fn: 'count' },
      { key: 'success_count', fn: 'sum',           sourceKey: '_success' },
      { key: 'failed_count',  fn: 'sum',           sourceKey: '_failed' },
      { key: 'ltv',           fn: 'sum',           sourceKey: '_amount' },
      { key: 'first_order',   fn: 'min',           sourceKey: 'created_at' },
      { key: 'last_order',    fn: 'max',           sourceKey: 'created_at' },
      { key: 'email',         fn: 'first',         sourceKey: '_email' },
      { key: 'customer_name', fn: 'first',         sourceKey: 'customer_name' },
      { key: 'phone',         fn: 'first',         sourceKey: 'phone' },
      { key: 'country',       fn: 'first',         sourceKey: '_country' },
      { key: '_app_role',     fn: 'first',         sourceKey: '_app_role' },
      { key: 'top_provider',  fn: 'collect',       sourceKey: '_provider' },
    ],
    computeAfter: [
      { key: 'email',       compute: (r) => String(r.email ?? r._email ?? 'unknown') },
      { key: 'avg_order',   compute: (r) => n(r.orders) > 0 ? parseFloat((n(r.ltv) / n(r.orders)).toFixed(2)) : 0 },
      { key: 'success_rate',compute: (r) => pct(n(r.success_count), n(r.orders)) },
      { key: 'fail_rate',   compute: (r) => pct(n(r.failed_count), n(r.orders)) },
      { key: 'status',      compute: (r) => n(r.orders) > 0 ? 'active' : 'inactive' },
      { key: 'country',     compute: (r) => String(r.country ?? r._country ?? '—') },
      { key: 'role',        compute: (r) => {
        const raw = String(r._app_role ?? r.role ?? 'user').toLowerCase()
        if (raw === 'admin') return 'Admin'
        if (raw === 'staff') return 'Staff'
        if (raw === 'user') return 'User'
        return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'User'
      } },
    ],
  },

  filterMappings: [],

  columns: [
    { key: 'email',         header: 'Email',         type: 'text',     sortable: true },
    { key: 'customer_name', header: 'Name',          type: 'text',     sortable: true },
    { key: 'role',          header: 'Role',          type: 'badge',    sortable: true },
    { key: 'phone',         header: 'Phone',         type: 'text',     sortable: false },
    { key: 'country',       header: 'Country',       type: 'badge',    sortable: true },
    { key: 'orders',        header: 'Recharges',     type: 'number',   sortable: true, align: 'right' },
    { key: 'success_count', header: 'Success',       type: 'number',   sortable: true, align: 'right' },
    { key: 'failed_count',  header: 'Failed',        type: 'number',   sortable: true, align: 'right' },
    { key: 'success_rate',  header: 'Success %',     type: 'percent',  sortable: true, align: 'right' },
    { key: 'ltv',           header: 'LTV (EUR)',     type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'avg_order',     header: 'Avg Order',     type: 'currency', sortable: true, align: 'right', currency: 'EUR' },
    { key: 'top_provider',  header: 'Top Provider',  type: 'badge',    sortable: true },
    { key: 'first_order',   header: 'First Order',   type: 'date',     sortable: true },
    { key: 'last_order',    header: 'Last Order',    type: 'date',     sortable: true },
    { key: 'status',        header: 'Status',        type: 'badge',    sortable: true },
  ],

  summaryCards: [
    { id: 'customers', label: 'Total Users', icon: 'Users',
      compute: (rows) => rows.filter((r) => r._counts_as_user !== false).length },
    { id: 'orders', label: 'Total Recharges', icon: 'FileSpreadsheet',
      compute: (rows) => rows.reduce((s, r) => s + n(r.orders), 0) },
    { id: 'ltv', label: 'Total LTV', icon: 'TrendingUp', currency: 'EUR',
      compute: (rows) => parseFloat(rows.reduce((s, r) => s + n(r.ltv), 0).toFixed(2)) },
    { id: 'success', label: 'Avg Success Rate', icon: 'CheckCircle2', suffix: '%',
      compute: (rows) => pct(
        rows.reduce((s, r) => s + n(r.success_count), 0),
        rows.reduce((s, r) => s + n(r.orders), 0),
      ) },
  ],

  charts: [
    { id: 'ltv_by_user', name: 'Top Users by LTV', labelKey: 'email', valueKey: 'ltv', type: 'bar', maxItems: 15 },
    { id: 'orders_by_user', name: 'Top Users by Recharges', labelKey: 'email', valueKey: 'orders', type: 'bar', maxItems: 15 },
    { id: 'ltv_by_country', name: 'LTV by Country', labelKey: 'country', valueKey: 'ltv', type: 'pie', maxItems: 10 },
    { id: 'success_rate', name: 'Success Rate by User', labelKey: 'email', valueKey: 'success_rate', type: 'line', maxItems: 15 },
  ],

  supportedFilters: ['search'],
  defaultSort: { column: 'ltv', direction: 'desc' },
  defaultDateRange: 'all_time',
}

// ─── 15. Audit ────────────────────────────────────────────────────────────────

const AUDIT: ReportConfig = {
  id:          REPORT_TYPE.AUDIT,
  name:        'Audit Log Report',
  description: 'Admin action audit trail — who did what and when.',
  icon:        'ShieldCheck',
  category:    'compliance',
  supportsCharts: false,
  exportable: true,

  source: {
    table:  'activity_logs',
    select: 'id,created_at,action,module,entity_id,ip_address,notes,admin_users(email)',
    fetchLimit: 5000,
  },
  dateColumn: 'created_at',
  searchColumns: ['action', 'module'],

  columns: [
    { key: 'created_at',  header: 'Timestamp',  type: 'datetime', sortable: true },
    { key: 'admin_email', header: 'Admin',       type: 'text',     sortable: false,
      compute: (r) => { const u = Array.isArray(r.admin_users) ? (r.admin_users as Record<string,unknown>[])[0] : r.admin_users; return (u as Record<string,unknown>|null)?.email ?? '—' } },
    { key: 'action',      header: 'Action',      type: 'badge',    sortable: true },
    { key: 'module',      header: 'Module',      type: 'text',     sortable: true },
    { key: 'entity_id',   header: 'Entity ID',   type: 'text',     sortable: false,
      compute: (r) => r.entity_id ?? '—' },
    { key: 'ip_address',  header: 'IP Address',  type: 'text',     sortable: false, visible: false,
      compute: (r) => r.ip_address ?? '—' },
    { key: 'notes',       header: 'Notes',       type: 'text',     sortable: false,
      compute: (r) => r.notes ?? '' },
  ],

  summaryCards: [
    { id: 'events', label: 'Total Events',  icon: 'ShieldCheck',
      compute: (rows) => rows.length },
    { id: 'admins', label: 'Unique Admins', icon: 'Users',
      compute: (rows) => new Set(rows.map(r => r.admin_email)).size },
  ],

  supportedFilters: ['adminUser', 'search'],
  defaultSort: { column: 'created_at', direction: 'desc' },
  defaultDateRange: 'last_7_days',
}

// ─── Master Registry ──────────────────────────────────────────────────────────

export const ALL_REPORT_CONFIGS: ReportConfig[] = [
  DASHBOARD_SUMMARY,
  TRANSACTIONS,
  COUNTRY,
  ORIGIN_COUNTRY,
  DESTINATION_COUNTRY,
  DESTINATION_NETWORK,
  PROVIDER,
  FINANCIAL,
  FAILED_RECHARGE,
  RECONCILIATION,
  WALLET,
  SETTLEMENT,
  CUSTOMER,
  AUDIT,
]

export const REPORT_CONFIG_MAP = new Map<string, ReportConfig>(
  ALL_REPORT_CONFIGS.map((c) => [c.id, c]),
)

export function getReportConfig(id: string): ReportConfig | undefined {
  return REPORT_CONFIG_MAP.get(id)
}
