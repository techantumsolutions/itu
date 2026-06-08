'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { RefreshCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type IntegrationColumn = {
  key: string
  label: string
  badge?: boolean
  datetime?: boolean
  /** Shown below the primary value in the same cell */
  secondaryKey?: string
  /** Keys searched when using the search filter (defaults to key + secondaryKey) */
  searchKeys?: string[]
}

export type IntegrationFiltersConfig = {
  searchPlaceholder?: string
  statusKey?: string
  countryKey?: string
  hideStatus?: boolean
  hideCountry?: boolean
}

type IntegrationDataPageProps = {
  title: string
  description: string
  endpoint: string
  collectionKey: string
  columns: IntegrationColumn[]
  filters?: IntegrationFiltersConfig
  actions?: ReactNode
  renderRowActions?: (
    row: Record<string, unknown>,
    helpers: { syncProvider: (providerId: string) => Promise<void>; syncingId: string | null },
  ) => ReactNode
  enableBulkSync?: boolean
  backLink?: { href: string; label: string }
}

const ACTIONS_COL =
  'sticky right-0 z-10 w-[128px] min-w-[128px] max-w-[128px] shrink-0 border-l border-border/60 bg-background group-hover:bg-muted/60 shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.15)]'

const ACTIONS_HEAD =
  'sticky right-0 z-20 w-[128px] min-w-[128px] max-w-[128px] shrink-0 border-l border-border/60 bg-muted/95 backdrop-blur-sm shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.15)]'

function isDateKey(key: string) {
  return key.includes('_at') || key.toLowerCase().includes('date')
}

function rawValue(row: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[part]
  }, row)
}

function formatPlain(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120)
  return String(value)
}

export function CompactDateTime({ value }: { value: unknown }) {
  const d = new Date(String(value ?? ''))
  if (Number.isNaN(d.getTime())) return <span>—</span>
  return (
    <div className="leading-tight whitespace-nowrap">
      <div className="text-xs font-medium">
        {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
    </div>
  )
}

function StackedCell({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <div className="min-w-0 leading-tight">
      <div className="truncate font-medium">{primary}</div>
      {secondary && secondary !== '—' ? (
        <div className="truncate text-[11px] text-muted-foreground">{secondary}</div>
      ) : null}
    </div>
  )
}

function renderCell(row: Record<string, unknown>, column: IntegrationColumn) {
  const primaryRaw = rawValue(row, column.key)
  const secondaryRaw = column.secondaryKey ? rawValue(row, column.secondaryKey) : undefined

  if (column.datetime || isDateKey(column.key)) {
    return <CompactDateTime value={primaryRaw} />
  }

  if (column.secondaryKey) {
    let secondary = formatPlain(secondaryRaw)
    if (column.secondaryKey === 'priority' && secondary !== '—') {
      secondary = `P${secondary}`
    }
    if (column.secondaryKey === 'mapped_count' && secondary !== '—') {
      secondary = `${secondary} mapped`
    }
    if (column.secondaryKey === 'currency' && secondary !== '—') {
      secondary = secondary.toUpperCase()
    }
    return (
      <StackedCell primary={formatPlain(primaryRaw)} secondary={secondary !== '—' ? secondary : undefined} />
    )
  }

  const text = formatPlain(primaryRaw)
  if (column.badge) return <StatusBadge value={text} />
  return text
}

function rowSearchText(row: Record<string, unknown>, columns: IntegrationColumn[]): string {
  const keys = new Set<string>()
  for (const col of columns) {
    keys.add(col.key)
    if (col.secondaryKey) keys.add(col.secondaryKey)
    col.searchKeys?.forEach((k) => keys.add(k))
  }
  return [...keys].map((k) => formatPlain(rawValue(row, k))).join(' ').toLowerCase()
}

export function IntegrationDataPage({
  title,
  description,
  endpoint,
  collectionKey,
  columns,
  filters: filtersConfig,
  actions,
  renderRowActions,
  enableBulkSync = true,
  backLink = { href: '/admin/integrations/operators', label: 'Back to operators' },
}: IntegrationDataPageProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [countryFilter, setCountryFilter] = useState('ALL')

  const statusKey = filtersConfig?.statusKey ?? columns.find((c) => c.key === 'status')?.key
  const countryKey =
    filtersConfig?.countryKey ??
    columns.find((c) => ['country_id', 'iso_code', 'country_iso3'].includes(c.key))?.key

  const showActions = Boolean(renderRowActions)
  const colSpan = columns.length + (showActions ? 1 : 0)

  const load = useMemo(
    () => async () => {
      setLoading(true)
      try {
        const res = await fetch(endpoint, { credentials: 'include', cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        setRows(Array.isArray(data?.[collectionKey]) ? data[collectionKey] : [])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Load failed')
        setRows([])
      } finally {
        setLoading(false)
      }
    },
    [collectionKey, endpoint],
  )

  useEffect(() => {
    void load()
  }, [load])

  const statusOptions = useMemo(() => {
    if (!statusKey || filtersConfig?.hideStatus) return []
    const values = new Set<string>()
    for (const row of rows) {
      const v = formatPlain(rawValue(row, statusKey))
      if (v !== '—') values.add(v)
    }
    return [...values].sort()
  }, [rows, statusKey, filtersConfig?.hideStatus])

  const countryOptions = useMemo(() => {
    if (!countryKey || filtersConfig?.hideCountry) return []
    const values = new Set<string>()
    for (const row of rows) {
      const v = formatPlain(rawValue(row, countryKey))
      if (v !== '—') values.add(v)
    }
    return [...values].sort()
  }, [rows, countryKey, filtersConfig?.hideCountry])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (q && !rowSearchText(row, columns).includes(q)) return false
      if (statusKey && statusFilter !== 'ALL') {
        if (formatPlain(rawValue(row, statusKey)).toUpperCase() !== statusFilter.toUpperCase()) return false
      }
      if (countryKey && countryFilter !== 'ALL') {
        if (formatPlain(rawValue(row, countryKey)).toUpperCase() !== countryFilter.toUpperCase()) return false
      }
      return true
    })
  }, [rows, search, statusFilter, countryFilter, statusKey, countryKey, columns])

  async function syncProvider(providerId: string) {
    setSyncingId(providerId)
    try {
      const res = await fetch('/api/admin/lcr/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      const fetched = data.result?.fetchedRaw ?? 0
      toast.success(`Sync finished (${fetched} raw plans)`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  async function triggerSyncAll() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/aggregator/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'inline' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      toast.success('Catalog sync finished')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setRefreshing(false)
    }
  }

  const showStatusFilter = statusOptions.length > 0
  const showCountryFilter = countryOptions.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
          {enableBulkSync ? (
            <Button onClick={() => void triggerSyncAll()} disabled={refreshing}>
              {refreshing ? 'Syncing…' : 'Sync all providers'}
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            <Link href={backLink.href} className="font-medium text-primary hover:underline">
              {backLink.label}
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={filtersConfig?.searchPlaceholder ?? 'Search…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            {showStatusFilter ? (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All status</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {showCountryFilter ? (
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All countries</SelectItem>
                  {countryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {!loading ? (
              <span className="text-xs text-muted-foreground">
                {filteredRows.length} of {rows.length}
              </span>
            ) : null}
          </div>

          <div className="relative min-w-0 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                  {showActions ? (
                    <TableHead className={ACTIONS_HEAD}>Actions</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                      No records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row, index) => (
                    <TableRow key={String(row.id ?? index)} className="group">
                      {columns.map((column) => (
                        <TableCell key={column.key}>{renderCell(row, column)}</TableCell>
                      ))}
                      {showActions && renderRowActions ? (
                        <TableCell className={ACTIONS_COL}>
                          {renderRowActions(row, { syncProvider, syncingId })}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? 'unknown')
  const active = ['ACTIVE', 'active', 'online', 'SUCCESS', 'true', 'completed'].includes(label)
  return <Badge variant={active ? 'default' : 'secondary'}>{label}</Badge>
}

export function IntegrationRowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">{children}</div>
}
