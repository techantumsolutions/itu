'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Package, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'

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
                  <Select value={countryFilter} onValueChange={setCountryFilter}>
                    <SelectTrigger className="h-8 text-xs font-normal">
                      <SelectValue placeholder="All countries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All countries</SelectItem>
                      {countryOptions.map((c) => (
                        <SelectItem key={c.iso3} value={c.iso3}>
                          {c.iso3} ({c.planCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-8 text-xs font-normal">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableHead>
                <TableHead className="py-2 font-normal normal-case">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-xs font-normal">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
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
