'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart2, Table as TableIcon, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { ReportSummaryCards } from './report-summary-cards'
import { ReportTable } from './report-table'
import { ReportChart } from './report-chart'
import { ReportFiltersBar } from './report-filters-bar'
import { ReportExportButton } from './report-export-button'

import { useSearchParams } from 'next/navigation'
import type {
  ReportDefinition,
  ReportFilters,
  ReportSort,
  ReportRow,
  ReportPagination,
  SummaryCard,
  ChartSeries,
  DateRangePreset,
} from '@/lib/reports/types'
import { getDefaultDateRange, resolveDateRange } from '@/lib/reports/date-range'

interface ReportViewerProps {
  definition: ReportDefinition
}

const DEFAULT_PAGE_SIZE = 50

export function ReportViewer({ definition }: ReportViewerProps) {
  const searchParams = useSearchParams()

  // ── State ──────────────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false)

  const [filters, setFilters]   = useState<ReportFilters>(() => {
    const defaultPreset = definition.defaultDateRange || 'last_30_days'
    const defaultRange = resolveDateRange(defaultPreset as DateRangePreset)
    const preset = searchParams.get('preset') as DateRangePreset | null
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const dateRange = preset
      ? resolveDateRange(preset, from ?? undefined, to ?? undefined)
      : defaultRange

    const parsed: ReportFilters = {
      dateRange,
      ...definition.defaultFilters,
    }

    // Auto-extract query param values that are supported by the report
    searchParams.forEach((val, key) => {
      if (key === 'preset' || key === 'from' || key === 'to') return
      
      if (key === 'minAmount' || key === 'maxAmount') {
        parsed[key] = Number(val)
      } else {
        parsed[key] = val
      }
    })

    return parsed
  })

  const [sort, setSort]         = useState<ReportSort | undefined>(definition.defaultSort)
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading]   = useState(false)
  const [hasRun, setHasRun]     = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')

  const [rows, setRows]                 = useState<ReportRow[]>([])
  const [pagination, setPagination]     = useState<ReportPagination>({ page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const [summaryCards, setSummaryCards] = useState<SummaryCard[]>([])
  const [chartData, setChartData]       = useState<ChartSeries[]>([])

  // Column visibility
  const initialVisibility = Object.fromEntries(
    definition.columns.map((c) => [c.key, c.visible !== false])
  )
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(initialVisibility)

  // ── Run report ─────────────────────────────────────────────────────────────
  const runReport = useCallback(async (
    overridePage?: number,
    overrideSort?: ReportSort,
    overrideFilters?: ReportFilters,
    overridePageSize?: number,
  ) => {
    const activePage     = overridePage     ?? page
    const activeSort     = overrideSort     ?? sort
    const activeFilters  = overrideFilters  ?? filters
    const activePageSize = overridePageSize ?? pageSize

    setLoading(true)
    try {
      const isCountryReport = (
        definition.id === 'country' ||
        definition.id === 'destination_country' ||
        definition.id === 'origin_country'
      )
      const endpoint = isCountryReport ? '/api/admin/reports/country' : '/api/admin/reports'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reportType: definition.id,
          filters:    activeFilters,
          page:       activePage,
          pageSize:   activePageSize,
          sort:       activeSort,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Report failed to load')
        return
      }

      const data = await res.json()
      setRows(data.rows ?? [])
      setPagination(data.pagination ?? { page: activePage, pageSize: activePageSize, total: 0 })
      setSummaryCards(data.summaryCards ?? [])
      setChartData(data.chartData ?? [])
      setHasRun(true)
    } catch (err) {
      console.error('[ReportViewer]', err)
      toast.error('Network error running report')
    } finally {
      setLoading(false)
    }
  }, [definition.id, filters, sort, page, pageSize])

  // Auto-run on first mount (using filters initialized from URL)
  useEffect(() => {
    void runReport(1, definition.defaultSort, filters)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition.id])

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleFilterChange(newFilters: ReportFilters) {
    setFilters(newFilters)
    setPage(1)
    void runReport(1, sort, newFilters, pageSize)
  }

  function handleRun() {
    setPage(1)
    void runReport(1, sort, filters, pageSize)
  }

  function handleSort(newSort: ReportSort) {
    setSort(newSort)
    setPage(1)
    void runReport(1, newSort, filters, pageSize)
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
    void runReport(newPage, sort, filters, pageSize)
  }

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize)
    setPage(1)
    void runReport(1, sort, filters, newSize)
  }

  function handleColumnVisibilityChange(key: string, visible: boolean) {
    setColumnVisibility((prev) => ({ ...prev, [key]: visible }))
  }

  const visibleRows = rows // All rows already paginated server-side

  // Active filters count for visual badge
  const activeFiltersCount = Object.keys(filters).filter(
    (k) => k !== 'dateRange' && filters[k] !== undefined && filters[k] !== ''
  ).length

  return (
    <div className="space-y-4">
      {/* Print-Only Header Section */}
      <div className="hidden print:block border-b border-border/80 pb-5 mb-5">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">ITU - International Mobile Top-Up Platform</h1>
            <p className="text-base font-semibold text-muted-foreground mt-1">{definition.label}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">Generated By: Admin User</div>
            <div>Generated Time: {new Date().toLocaleString()}</div>
            <div>
              Date Range: {filters.dateRange?.from ? `${filters.dateRange.from} to ${filters.dateRange.to}` : 'All Time'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Unified Dashboard Control Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border border-border/40 p-4 rounded-xl shadow-sm">
        <div>
          <h2 className="text-base font-bold tracking-tight text-foreground">{definition.label}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{definition.description}</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto ml-auto">
          {/* Filters Toggle Button */}
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5 h-9 font-semibold text-xs transition-all shrink-0"
          >
            <SlidersHorizontal className="size-3.5 shrink-0" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-1 bg-primary-foreground text-primary rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                {activeFiltersCount}
              </span>
            )}
          </Button>



          {/* Run/Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9 font-semibold text-xs shrink-0"
            onClick={handleRun}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 shrink-0 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Export Button */}
          {definition.exportable && (
            <ReportExportButton
              rows={rows}
              columns={definition.columns}
              filters={filters}
              sort={sort}
              reportName={definition.label}
              summaryCards={summaryCards}
            />
          )}
        </div>
      </div>

      {/* ── Collapsible Filters Area ── */}
      {showFilters && (
        <div className="border border-border/40 bg-card/65 backdrop-blur-md rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <ReportFiltersBar
            filters={filters}
            definition={definition}
            onChange={handleFilterChange}
            loading={loading}
          />
        </div>
      )}

      {/* ── Always-visible Summary Cards ── */}
      {summaryCards.length > 0 && (
        <ReportSummaryCards cards={summaryCards} loading={loading} />
      )}

      {/* ── Main View (Table/Chart) ── */}
      <Card className="border border-border/40 bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-3 px-5 border-b border-border/40">
          <div className="flex items-center gap-3">
            {definition.supportsCharts && (
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'chart')}>
                <TabsList className="h-8 p-0.5 bg-muted/60">
                  <TabsTrigger value="table" className="gap-1.5 h-7 text-xs px-3 font-semibold">
                    <TableIcon className="size-3.5" />
                    Table View
                  </TabsTrigger>
                  <TabsTrigger value="chart" className="gap-1.5 h-7 text-xs px-3 font-semibold">
                    <BarChart2 className="size-3.5" />
                    Chart View
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {!definition.supportsCharts && (
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Report Records</span>
            )}
          </div>
          <span className="text-[11px] font-bold bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full">
            {hasRun && !loading ? `${new Intl.NumberFormat('en-US').format(pagination.total)} records` : 'Loading...'}
          </span>
        </CardHeader>

        <CardContent className="p-0">
          {viewMode === 'chart' && definition.supportsCharts && chartData.length > 0 ? (
            <div className="p-5 space-y-6 overflow-y-auto max-h-[600px] w-full">
              {(
                definition.id === 'country' ||
                definition.id === 'destination_country' ||
                definition.id === 'origin_country' ||
                definition.id === 'destination_network' ||
                definition.id === 'provider' ||
                definition.id === 'transactions' ||
                definition.id === 'reconciliation' ||
                definition.id === 'customer'
              ) ? (
                chartData.map((c) => (
                  <ReportChart
                    key={c.id}
                    series={[c]}
                    height={300}
                    currency={
                      definition.id === 'reconciliation' ||
                      definition.id === 'provider' ||
                      definition.id === 'destination_network' ||
                      definition.id === 'transactions' ||
                      definition.id === 'country' ||
                      definition.id === 'destination_country' ||
                      definition.id === 'origin_country'
                        ? 'EUR'
                        : undefined
                    }
                  />
                ))
              ) : (
                <ReportChart series={chartData} height={300} />
              )}
            </div>
          ) : (
            <ReportTable
              columns={definition.columns}
              rows={visibleRows}
              loading={loading}
              sort={sort}
              pagination={pagination}
              onSortChange={handleSort}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
