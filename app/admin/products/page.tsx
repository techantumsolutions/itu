'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Package, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { normalizeCountryIso3, countryDisplayName } from '@/lib/lcr/countries'

type ProductPlan = {
  id: string
  plan_name: string
  country_iso3: string
  operator_name: string
  category: string
  active: boolean
}

type CountryOption = { iso3: string; planCount: number }

const CATEGORIES = ['topup', 'data', 'combo', 'airtime'] as const

/* Searchable combo-filter: type to search + pick from dropdown */
function ComboFilter({
  value,
  onValueChange,
  options,
  placeholder,
  allLabel = 'All',
}: {
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
  allLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    )
  }, [options, search])

  const displayLabel = value === 'all' ? allLabel : (options.find((o) => o.value === value)?.label ?? value)

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setTimeout(() => inputRef.current?.focus(), 50) }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2 text-xs font-normal ring-offset-background hover:bg-accent hover:text-accent-foreground',
            !value || value === 'all' ? 'text-muted-foreground' : '',
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="border-b px-2 py-1.5">
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${placeholder.toLowerCase()}…`}
            className="h-7 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[220px] overflow-y-auto p-1">
          <button
            type="button"
            className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent', value === 'all' && 'font-semibold')}
            onClick={() => { onValueChange('all'); setOpen(false); setSearch('') }}
          >
            {value === 'all' ? <Check className="h-3 w-3" /> : <span className="w-3" />}
            {allLabel}
          </button>
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent', value === opt.value && 'font-semibold')}
              onClick={() => { onValueChange(opt.value); setOpen(false); setSearch('') }}
            >
              {value === opt.value ? <Check className="h-3 w-3" /> : <span className="w-3" />}
              {opt.label}
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No results</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function buildQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const v = value?.trim()
    if (v && v !== 'all') q.set(key, v)
  }
  q.set('limit', '500')
  return `?${q.toString()}`
}

export default function AdminProductsPage() {
  const [plans, setPlans] = useState<ProductPlan[]>([])
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([])
  const [planNameFilter, setPlanNameFilter] = useState('')
  const [debouncedPlanName, setDebouncedPlanName] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [operatorFilter, setOperatorFilter] = useState('')
  const [debouncedOperator, setDebouncedOperator] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const appliedCountry = useMemo(
    () => (countryFilter === 'all' ? '' : normalizeCountryIso3(countryFilter)),
    [countryFilter],
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPlanName(planNameFilter), 300)
    return () => clearTimeout(t)
  }, [planNameFilter])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedOperator(operatorFilter), 300)
    return () => clearTimeout(t)
  }, [operatorFilter])

  const loadCountries = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lcr/countries', { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      setCountryOptions(Array.isArray(data?.countries) ? data.countries : [])
    } catch {
      /* optional */
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const query = buildQuery({
        q: debouncedPlanName || undefined,
        countryIso3: appliedCountry || undefined,
        operatorName: debouncedOperator || undefined,
        category: categoryFilter,
        status: statusFilter,
      })
      const res = await fetch(`/api/admin/lcr/internal-plans${query}`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load products')
      setPlans(Array.isArray(data?.internalPlans) ? data.internalPlans : [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load products'
      setLoadError(message)
      toast.error(message)
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [appliedCountry, categoryFilter, debouncedOperator, debouncedPlanName, statusFilter])

  useEffect(() => {
    void loadCountries()
  }, [loadCountries])

  useEffect(() => {
    void load()
  }, [load])

  async function triggerSync() {
    setRefreshing(true)
    try {
      const providersRes = await fetch('/api/admin/lcr/providers', { credentials: 'include', cache: 'no-store' })
      const providersData = await providersRes.json().catch(() => ({}))
      if (!providersRes.ok) throw new Error(providersData.error ?? 'Failed to load providers')

      const activeIds = (Array.isArray(providersData?.providers) ? providersData.providers : [])
        .filter((p: { is_active?: boolean; id?: string }) => p.is_active && p.id)
        .map((p: { id: string }) => p.id)

      if (activeIds.length === 0) throw new Error('No active providers to sync.')

      const syncBody: Record<string, unknown> = {}
      if (appliedCountry) syncBody.countryIso3 = appliedCountry

      for (const providerId of activeIds) {
        const res = await fetch('/api/admin/lcr/sync', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, ...syncBody }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      }

      toast.success(
        appliedCountry
          ? `Catalog sync finished for ${appliedCountry}`
          : `Catalog sync finished (${activeIds.length} provider(s), all countries)`,
      )
      await loadCountries()
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground">
            Catalog plans from all synced countries. Use column filters below — leave country on &quot;All countries&quot; for the full catalog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
          <Button onClick={() => void triggerSync()} disabled={refreshing}>
            {refreshing ? 'Syncing…' : appliedCountry ? `Sync ${appliedCountry}` : 'Sync all countries'}
          </Button>
        </div>
      </div>

      {loadError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-5" />
            Product catalog
          </CardTitle>
          <CardDescription>
            {loading
              ? 'Loading…'
              : `${plans.length} plan(s) shown${countryOptions.length ? ` · ${countryOptions.length} countries in database` : ''}.`}
            {' '}
            <Link href="/admin/providers" className="font-medium text-primary hover:underline">
              Sync providers
            </Link>{' '}
            to ingest more countries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32%]">Plan name</TableHead>
                <TableHead className="w-[12%]">Country</TableHead>
                <TableHead className="w-[28%]">Operator name</TableHead>
                <TableHead className="w-[14%]">Category</TableHead>
                <TableHead className="w-[14%]">Status</TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className="py-2 font-normal normal-case">
                  <Input
                    placeholder="Search plan…"
                    value={planNameFilter}
                    onChange={(e) => setPlanNameFilter(e.target.value)}
                    className="h-8 text-xs font-normal"
                  />
                </TableHead>
                <TableHead className="py-2 font-normal normal-case">
                  <ComboFilter
                    value={countryFilter}
                    onValueChange={setCountryFilter}
                    placeholder="Country"
                    allLabel="All countries"
                    options={countryOptions.map((c) => ({
                      value: c.iso3,
                      label: `${c.iso3} — ${countryDisplayName(c.iso3, c.iso3)} (${c.planCount})`,
                    }))}
                  />
                </TableHead>
                <TableHead className="py-2 font-normal normal-case">
                  <Input
                    placeholder="Operator name…"
                    value={operatorFilter}
                    onChange={(e) => setOperatorFilter(e.target.value)}
                    className="h-8 text-xs font-normal"
                  />
                </TableHead>
                <TableHead className="py-2 font-normal normal-case">
                  <ComboFilter
                    value={categoryFilter}
                    onValueChange={setCategoryFilter}
                    placeholder="Category"
                    allLabel="All categories"
                    options={CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
                  />
                </TableHead>
                <TableHead className="py-2 font-normal normal-case">
                  <ComboFilter
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                    placeholder="Status"
                    allLabel="All statuses"
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ]}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Loading products…
                  </TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No products match your filters. Sync providers to ingest plans from more countries.
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.plan_name}</TableCell>
                    <TableCell>{plan.country_iso3 || '—'}</TableCell>
                    <TableCell>{plan.operator_name || '—'}</TableCell>
                    <TableCell className="capitalize">{plan.category || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={plan.active ? 'default' : 'secondary'}>
                        {plan.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
