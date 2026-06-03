'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { RefreshCcw, Search, Loader2 } from 'lucide-react'
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

export function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? 'unknown')
  const active = ['ACTIVE', 'active', 'online', 'SUCCESS', 'true', 'completed'].includes(label)
  return (
    <Badge
      variant="outline"
      className={
        active
          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-semibold'
          : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20 font-semibold'
      }
    >
      {label}
    </Badge>
  )
}

export default function OperatorsPage() {
  const [rawOperators, setRawOperators] = useState<any[]>([])
  const [systemOperators, setSystemOperators] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [countriesList, setCountriesList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Filters state
  const [dataType, setDataType] = useState<'system' | 'provider'>('system')
  const [providerFilter, setProviderFilter] = useState('ALL')
  const [countryFilter, setCountryFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const endpoint = '/api/admin/aggregator/operators'

  // Fetch static countries on mount for dropdown
  useEffect(() => {
    fetch('/api/countries', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.countries)) {
          setCountriesList(data.countries)
        }
      })
      .catch(() => {})
  }, [])

  const load = async (
    isRefresh = false,
    country = countryFilter,
    provider = providerFilter,
    queryText = search
  ) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    const params = new URLSearchParams()
    if (country !== 'ALL') params.set('country', country)
    if (provider !== 'ALL') params.set('providerId', provider)
    if (queryText.trim()) params.set('q', queryText.trim())

    const queryStr = params.toString()
    const url = queryStr ? `${endpoint}?${queryStr}` : endpoint

    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setRawOperators(Array.isArray(data?.rawOperators) ? data.rawOperators : [])
      setSystemOperators(Array.isArray(data?.systemOperators) ? data.systemOperators : [])
      setProviders(Array.isArray(data?.providers) ? data.providers : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Load failed')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Trigger debounced load on filters or search input changes (resolves PostgREST row limits)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      void load(false, countryFilter, providerFilter, search)
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [countryFilter, providerFilter, search])

  // Sync All Providers
  const triggerSyncAll = async () => {
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
      await load(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setRefreshing(false)
    }
  }

  // Toggle System Operator Status
  const toggleSystemOperatorStatus = async (id: string, currentStatus: string) => {
    setTogglingId(id)
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      const res = await fetch(`/api/admin/aggregator/operators/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to toggle status')

      // Update local state directly
      setSystemOperators((prev) =>
        prev.map((op) => (op.id === id ? { ...op, status: newStatus } : op))
      )
      toast.success(`Operator set to ${newStatus}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle status')
    } finally {
      setTogglingId(null)
    }
  }

  // Reset provider and country filter if they are not available in current tab data
  useEffect(() => {
    setProviderFilter('ALL')
    setCountryFilter('ALL')
  }, [dataType])

  // Map backend operators to normalized rows for local rendering (backend does the filtering)
  const renderedRows = useMemo(() => {
    if (dataType === 'system') {
      return systemOperators.map((op) => ({
        id: op.id,
        mainName: op.system_operator_name,
        secondaryText: op.slug,
        countryCode: op.country_id,
        operatorType: op.operator_type || '—',
        status: op.status,
        dateValue: op.updated_at || op.created_at,
        isSystem: true,
      }))
    } else {
      return rawOperators.map((op) => ({
        id: op.id,
        mainName: op.provider_operator_name,
        secondaryText: `${op.provider_operator_id} (${op.provider_name ?? 'Raw'})`,
        countryCode: op.iso_code || op.country_code,
        operatorType: op.operator_type || '—',
        status: op.status,
        dateValue: op.fetched_at,
        isSystem: false,
      }))
    }
  }, [systemOperators, rawOperators, dataType])

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operators</h1>
          <p className="text-muted-foreground">
            Manage provider operators and unified system-ready operators catalog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load(true)} disabled={loading || refreshing}>
            <RefreshCcw className={`mr-2 size-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => void triggerSyncAll()} disabled={loading || refreshing}>
            {refreshing ? 'Syncing…' : 'Sync all providers'}
          </Button>
        </div>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle>Operators List</CardTitle>
          <CardDescription>
            <Link href="/admin/integrations" className="font-medium text-primary hover:underline">
              Back to integrations
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Search Input */}
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search operator, ID, provider…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 bg-background border-border/80 focus-visible:ring-primary"
              />
            </div>

            {/* Operator Data Type Filter */}
            <div className="flex flex-col gap-1">
              <Select value={dataType} onValueChange={(val: any) => setDataType(val)}>
                <SelectTrigger className="w-[180px] bg-background border-border/80 font-medium">
                  <SelectValue placeholder="Data Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System Operator</SelectItem>
                  <SelectItem value="provider">Provider Operator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Provider Filter */}
            <div className="flex flex-col gap-1">
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[180px] bg-background border-border/80">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Providers</SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Country Filter */}
            <div className="flex flex-col gap-1">
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-[180px] bg-background border-border/80">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Countries</SelectItem>
                  {countriesList.map((c) => (
                    <SelectItem key={c.iso3} value={c.iso3.toUpperCase()}>
                      {c.name} ({c.iso3})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Counts info */}
            {!loading ? (
              <span className="text-xs text-muted-foreground ml-auto bg-muted/50 px-2 py-1 rounded-md font-medium">
                Found {renderedRows.length} operators
              </span>
            ) : null}
          </div>

          {/* Table Container */}
          <div className="relative min-w-0 overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold text-muted-foreground">Operator</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Country</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Type</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">
                    {dataType === 'system' ? 'Updated' : 'Fetched'}
                  </TableHead>
                  <TableHead className="font-semibold text-muted-foreground text-right w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span>Loading operators data...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : renderedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground font-medium">
                      No records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  renderedRows.map((row) => {
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                        {/* Operator Column */}
                        <TableCell>
                          <div className="min-w-0 leading-tight">
                            <div className="truncate font-semibold text-foreground">{row.mainName}</div>
                            {row.secondaryText ? (
                              <div className="truncate text-xs text-muted-foreground mt-0.5 font-mono">
                                {row.secondaryText}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        
                        {/* Country Column */}
                        <TableCell>
                          <Badge variant="outline" className="bg-background text-xs font-semibold px-2 py-0.5 border-border/80 font-mono">
                            {String(row.countryCode ?? '—').toUpperCase()}
                          </Badge>
                        </TableCell>

                        {/* Type Column */}
                        <TableCell className="text-sm font-medium text-muted-foreground capitalize">
                          {String(row.operatorType).toLowerCase()}
                        </TableCell>

                        {/* Status Column */}
                        <TableCell>
                          <StatusBadge value={row.status} />
                        </TableCell>

                        {/* Date Column */}
                        <TableCell>
                          <CompactDateTime value={row.dateValue} />
                        </TableCell>

                        {/* Actions Column */}
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-2">
                            {/* Plans view button */}
                            <Button size="sm" variant="outline" className="h-8 text-xs font-medium" asChild>
                              <Link
                                href={
                                  row.isSystem
                                    ? `/admin/integrations/plans?systemOperatorId=${row.id}`
                                    : `/admin/integrations/plans?operatorRawId=${row.id}`
                                }
                              >
                                Plans
                              </Link>
                            </Button>

                            {/* Active/Inactive Toggle Button (Only for System Operators) */}
                            {row.isSystem ? (
                              <Button
                                size="sm"
                                variant={row.status === 'ACTIVE' ? 'destructive-outline' : 'emerald-outline'}
                                className={`h-8 text-xs font-semibold w-24 flex items-center justify-center ${
                                  row.status === 'ACTIVE'
                                    ? 'border-red-500/30 text-red-500 hover:bg-red-500/10'
                                    : 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                                }`}
                                onClick={() => void toggleSystemOperatorStatus(row.id, row.status)}
                                disabled={togglingId === row.id}
                              >
                                {togglingId === row.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                              </Button>
                            ) : (
                              // Map action button for provider raw operators
                              <Button size="sm" variant="ghost" className="h-8 text-xs font-medium text-primary" asChild>
                                <Link href="/admin/integrations/operator-mapping">Map</Link>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
