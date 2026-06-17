'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { History, Loader2, RefreshCcw, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'

function CompactDateTime({ value }: { value: unknown }) {
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

function StatusBadge({ value }: { value: unknown }) {
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

type OperatorHistoryRow = {
  id: string
  countryIso3: string
  sourceOperatorName: string
  targetOperatorName: string
  sourceMergeKey: string
  targetMergeKey: string
  mergedByAdmin: string | null
  isActive: boolean
  createdAt?: string | null
}

type PlanHistoryRow = {
  id: string
  countryIso3: string
  systemOperatorMergeKey: string
  sourcePlanName: string
  targetPlanName: string
  sourcePlanSignature: string
  targetPlanSignature: string
  mergedByAdmin: string | null
  isActive: boolean
  createdAt?: string | null
}

type CountryOption = { iso3: string; name: string }

export default function CatalogHistoryPage() {
  const [tab, setTab] = useState<'operators' | 'plans'>('operators')
  const [countryFilter, setCountryFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([])
  const [operatorHistory, setOperatorHistory] = useState<OperatorHistoryRow[]>([])
  const [planHistory, setPlanHistory] = useState<PlanHistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)

  const appliedCountry = useMemo(
    () => (countryFilter === 'all' ? '' : normalizeCountryIso3(countryFilter)),
    [countryFilter],
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    void fetch('/api/countries', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setCountryOptions(Array.isArray(data?.countries) ? data.countries : [])
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (appliedCountry) params.set('countryIso3', appliedCountry)
      if (debouncedSearch) params.set('q', debouncedSearch)

      const [opRes, planRes] = await Promise.all([
        fetch(`/api/admin/catalog/operator-merge-history?${params}`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/admin/catalog/plan-merge-history?${params}`, { credentials: 'include', cache: 'no-store' }),
      ])

      const opData = await opRes.json().catch(() => ({}))
      const planData = await planRes.json().catch(() => ({}))

      if (!opRes.ok) throw new Error(opData.error ?? 'Failed to load operator history')
      if (!planRes.ok) throw new Error(planData.error ?? 'Failed to load plan history')

      setOperatorHistory(Array.isArray(opData.history) ? opData.history : [])
      setPlanHistory(Array.isArray(planData.history) ? planData.history : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load catalog history')
    } finally {
      setLoading(false)
    }
  }, [appliedCountry, debouncedSearch])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleRule(type: 'operators' | 'plans', id: string, isActive: boolean) {
    setActingId(id)
    try {
      const res = await fetch(`/api/admin/catalog/${type === 'operators' ? 'operator' : 'plan'}-merge-history/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update rule')
      toast.success(isActive ? 'Rule restored' : 'Rule disabled')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update rule')
    } finally {
      setActingId(null)
    }
  }

  async function deleteRule(type: 'operators' | 'plans', id: string) {
    if (!confirm('Delete this history rule permanently? Existing operators/plans will not be changed.')) return

    setActingId(id)
    try {
      const res = await fetch(`/api/admin/catalog/${type === 'operators' ? 'operator' : 'plan'}-merge-history/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete rule')
      toast.success('Rule deleted')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete rule')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6" />
            Catalog History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Persistent operator and plan merge rules reapplied automatically on every sync.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Search and filter merge history by country.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search source, target, keys…"
              className="pl-9"
            />
          </div>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countryOptions.map((country) => (
                <SelectItem key={country.iso3} value={country.iso3}>
                  {country.name} ({country.iso3})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'operators' | 'plans')}>
        <TabsList>
          <TabsTrigger value="operators">Operators ({operatorHistory.length})</TabsTrigger>
          <TabsTrigger value="plans">Plans ({planHistory.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="operators">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Keys</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operatorHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {loading ? 'Loading…' : 'No operator merge history yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    operatorHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.countryIso3}</TableCell>
                        <TableCell className="font-medium">{row.sourceOperatorName}</TableCell>
                        <TableCell>{row.targetOperatorName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.sourceMergeKey} → {row.targetMergeKey}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={row.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        </TableCell>
                        <TableCell>
                          <CompactDateTime value={row.createdAt} />
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === row.id}
                            onClick={() => void toggleRule('operators', row.id, !row.isActive)}
                          >
                            {row.isActive ? 'Disable' : 'Restore'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actingId === row.id}
                            onClick={() => void deleteRule('operators', row.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Operator Key</TableHead>
                    <TableHead>Source Plan</TableHead>
                    <TableHead>Target Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {loading ? 'Loading…' : 'No plan merge history yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    planHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.countryIso3}</TableCell>
                        <TableCell className="text-xs">{row.systemOperatorMergeKey}</TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate" title={row.sourcePlanName}>
                          {row.sourcePlanName}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={row.targetPlanName}>
                          {row.targetPlanName}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={row.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        </TableCell>
                        <TableCell>
                          <CompactDateTime value={row.createdAt} />
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === row.id}
                            onClick={() => void toggleRule('plans', row.id, !row.isActive)}
                          >
                            {row.isActive ? 'Disable' : 'Restore'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actingId === row.id}
                            onClick={() => void deleteRule('plans', row.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Disabling or deleting a rule only stops future auto-merges during sync. It does not undo existing catalog data.
      </p>
    </div>
  )
}
