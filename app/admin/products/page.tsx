'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Package, RefreshCcw, Loader2, GitMerge, ChevronDown, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { normalizeCountryIso3, countryDisplayName } from '@/lib/lcr/countries'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { SystemPlanProviderCostBreakdown } from '@/lib/admin/provider-cost-breakdown'
import { formatMoney } from '@/lib/admin/provider-pricing-extractor'
import { useAuthStore } from '@/lib/stores'
import { clientHasAdminPermission } from '@/lib/auth/client-features'
import { useProviderDisplay } from '@/components/admin/provider-display-context'
import { matchesProviderListSearch } from '@/lib/admin/operator-list-search'

type ProductPlan = {
  id: string
  plan_name: string
  country_iso3: string
  operator_name: string
  category: string
  active: boolean
  provider_count?: number
  provider_names?: string[]
  provider_codes?: string[]
}

type CountryOption = {
  code: string
  iso3: string
  name: string
  flag: string
  dialCode: string
}

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

function sumProviderFees(rechargeCost: {
  fees: number | null
  gatewayCharge: number | null
  surcharge: number | null
  tax: number | null
}): number | null {
  const parts = [rechargeCost.fees, rechargeCost.gatewayCharge, rechargeCost.surcharge, rechargeCost.tax].filter(
    (v): v is number => v != null && Number.isFinite(v),
  )
  if (parts.length === 0) return null
  return parts.reduce((sum, n) => sum + n, 0)
}



export default function AdminProductsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const { displayProvider, displayProvidersCsv } = useProviderDisplay()
  const canSync = user && clientHasAdminPermission(user, 'plans.sync')
  const canEdit = user && clientHasAdminPermission(user, 'plans.edit')
  const showSelection = !!canEdit
  const showStatusToggle = !!canEdit

  const fromOperators = searchParams.get('from') === 'operators'
  const operatorsTab = searchParams.get('tab')
  const urlOperatorName = searchParams.get('operatorName')?.trim() ?? ''
  const urlSystemOperatorId = searchParams.get('systemOperatorId')?.trim() ?? ''
  const urlOperatorRawId = searchParams.get('operatorRawId')?.trim() ?? ''

  const [plans, setPlans] = useState<ProductPlan[]>([])
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([])
  const [planNameFilter, setPlanNameFilter] = useState('')
  const [debouncedPlanName, setDebouncedPlanName] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [operatorFilter, setOperatorFilter] = useState(urlOperatorName)
  const [debouncedOperator, setDebouncedOperator] = useState(urlOperatorName)
  const [providerFilter, setProviderFilter] = useState('')
  const [debouncedProviderFilter, setDebouncedProviderFilter] = useState('')
  const [systemOperatorIdFilter, setSystemOperatorIdFilter] = useState(urlSystemOperatorId)
  const [operatorRawIdFilter, setOperatorRawIdFilter] = useState(urlOperatorRawId)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState(fromOperators ? 'all' : 'active')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [targetPlanId, setTargetPlanId] = useState<string>('')
  const [merging, setMerging] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [costDialogOpen, setCostDialogOpen] = useState(false)
  const [costLoading, setCostLoading] = useState(false)
  const [costError, setCostError] = useState<string | null>(null)
  const [costBreakdown, setCostBreakdown] = useState<SystemPlanProviderCostBreakdown | null>(null)

  const returnOperatorsHref =
    operatorsTab === 'provider' || operatorsTab === 'system'
      ? `/admin/integrations/operators?tab=${operatorsTab}`
      : '/admin/integrations/operators'

  useEffect(() => {
    const operatorName = searchParams.get('operatorName')?.trim() ?? ''
    const systemOperatorId = searchParams.get('systemOperatorId')?.trim() ?? ''
    const operatorRawId = searchParams.get('operatorRawId')?.trim() ?? ''
    const fromOps = searchParams.get('from') === 'operators'

    setOperatorFilter(operatorName)
    setDebouncedOperator(operatorName)
    setSystemOperatorIdFilter(systemOperatorId)
    setOperatorRawIdFilter(operatorRawId)
    if (fromOps) setStatusFilter('all')
  }, [searchParams])

  const countryNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of countryOptions) {
      if (c.name) {
        if (c.iso3) map.set(c.iso3.trim().toUpperCase(), c.name.trim())
        if (c.code) map.set(c.code.trim().toUpperCase(), c.name.trim())
      }
    }
    return map
  }, [countryOptions])

  const selectedPlans = useMemo(() => {
    return plans.filter((p) => selectedIds.includes(p.id))
  }, [plans, selectedIds])

  const openProviderCosts = useCallback(async (planId: string) => {
    setCostDialogOpen(true)
    setCostLoading(true)
    setCostError(null)
    setCostBreakdown(null)
    try {
      const res = await fetch(`/api/admin/lcr/system-plans/${encodeURIComponent(planId)}/provider-costs`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load provider costs')
      setCostBreakdown(data.breakdown ?? null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load provider costs'
      setCostError(message)
      toast.error(message)
    } finally {
      setCostLoading(false)
    }
  }, [])

  useEffect(() => {
    setPage(1)
    setSelectedIds([])
  }, [countryFilter, operatorFilter, planNameFilter, providerFilter, categoryFilter, statusFilter, pageSize])

  const togglePlanStatus = async (id: string, currentActive: boolean) => {
    setTogglingId(id)
    const newActive = !currentActive
    try {
      const res = await fetch(`/api/admin/catalog/system-plans`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active: newActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update plan status')

      // Update local state directly
      setPlans((prev) =>
        prev.map((p) => (p.id === id ? { ...p, active: newActive } : p))
      )
      toast.success(`Plan set to ${newActive ? 'Active' : 'Inactive'}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update plan status')
    } finally {
      setTogglingId(null)
    }
  }

  const handleMerge = async () => {
    if (!targetPlanId) {
      toast.error('Please select a target plan')
      return
    }
    const mergeTargetId = targetPlanId
    const sourcePlanIds = selectedIds.filter((id) => id !== mergeTargetId)
    if (sourcePlanIds.length === 0) {
      toast.error('At least one source plan must be merged')
      return
    }

    setMerging(true)
    try {
      const res = await fetch('/api/admin/lcr/system-plans/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetPlanId: mergeTargetId,
          sourcePlanIds,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Merge failed')

      const returnedTargetId =
        typeof data.targetId === 'string'
          ? data.targetId
          : typeof data.targetPlanId === 'string'
            ? data.targetPlanId
            : mergeTargetId

      if (!returnedTargetId) {
        console.warn('Missing target id')
        toast.error('Merge completed but target plan id was missing from the response')
        return
      }

      toast.success('Plans merged successfully')
      router.refresh()
      await load()
      setMergeDialogOpen(false)
      setSelectedIds([])
      setTargetPlanId('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to merge plans')
    } finally {
      setMerging(false)
    }
  }

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedProviderFilter(providerFilter), 300)
    return () => clearTimeout(t)
  }, [providerFilter])

  const loadCountries = useCallback(async () => {
    try {
      const res = await fetch('/api/countries', { cache: 'no-store' })
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
        systemOperatorId: systemOperatorIdFilter || undefined,
        operatorRawId: operatorRawIdFilter || undefined,
        category: categoryFilter,
        status: statusFilter,
      })
      const res = await fetch(`/api/admin/catalog/system-plans${query}`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load products')
      setPlans(Array.isArray(data?.systemPlans) ? data.systemPlans : [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load products'
      setLoadError(message)
      toast.error(message)
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [appliedCountry, categoryFilter, debouncedOperator, debouncedPlanName, operatorRawIdFilter, statusFilter, systemOperatorIdFilter])

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

  const tableColSpan = 7 + (showSelection ? 1 : 0) + (showStatusToggle ? 1 : 0)

  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const countryA = countryNameMap.get(a.country_iso3.toUpperCase()) || countryDisplayName(a.country_iso3) || ''
      const countryB = countryNameMap.get(b.country_iso3.toUpperCase()) || countryDisplayName(b.country_iso3) || ''
      
      const comp = countryA.localeCompare(countryB)
      if (comp !== 0) return comp
      
      return a.plan_name.localeCompare(b.plan_name)
    })
  }, [plans, countryNameMap])

  const filteredPlans = useMemo(() => {
    if (!debouncedProviderFilter.trim()) return sortedPlans
    return sortedPlans.filter((plan) =>
      matchesProviderListSearch(debouncedProviderFilter, plan.provider_names ?? [], plan.provider_codes ?? []),
    )
  }, [sortedPlans, debouncedProviderFilter])

  const totalPages = Math.max(1, Math.ceil(filteredPlans.length / pageSize))
  const paginatedPlans = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredPlans.slice(start, start + pageSize)
  }, [filteredPlans, page, pageSize])

  return (
    <div className="space-y-6">
      {fromOperators ? (
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link href={returnOperatorsHref}>
            <ArrowLeft className="mr-2 size-4" />
            Back to operators
          </Link>
        </Button>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plans</h1>
          <p className="text-muted-foreground">
            Catalog plans from all synced countries. Use column filters below — leave country on &quot;All countries&quot; for the full catalog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && selectedIds.length >= 2 ? (
            <Button
              variant="default"
              onClick={() => {
                setTargetPlanId(selectedIds[0] || '')
                setMergeDialogOpen(true)
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/95 animate-fade-in"
            >
              <GitMerge className="mr-2 size-4" />
              Merge Plans ({selectedIds.length})
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
          {canSync ? (
          <Button onClick={() => void triggerSync()} disabled={refreshing}>
            {refreshing
              ? 'Syncing…'
              : appliedCountry
                ? `Sync ${countryNameMap.get(appliedCountry) || appliedCountry}`
                : 'Sync all countries'}
          </Button>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {showSelection ? (
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={
                      paginatedPlans.length > 0 &&
                      paginatedPlans.every((p) => selectedIds.includes(p.id))
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const pageIds = paginatedPlans.map((p) => p.id)
                        setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])))
                      } else {
                        const pageIds = paginatedPlans.map((p) => p.id)
                        setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)))
                      }
                    }}
                  />
                </TableHead>
                ) : null}
                <TableHead className="w-[28%]">Plan name</TableHead>
                <TableHead className="w-[12%]">Country</TableHead>
                <TableHead className="w-[24%]">Operator name</TableHead>
                <TableHead className="w-[16%]">Provider</TableHead>
                <TableHead className="w-[12%]">Category</TableHead>
                <TableHead className="w-[12%]">Status</TableHead>
                {showStatusToggle ? (
                <TableHead className="w-[12%] text-right">Action</TableHead>
                ) : null}
              </TableRow>
              <TableRow className="hover:bg-transparent">
                {showSelection ? <TableHead className="py-2" /> : null}
                <TableHead className="py-2 font-normal normal-case">
                  <Input
                    placeholder="Search plan, provider…"
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
                      value: c.iso3 ? c.iso3.toUpperCase() : c.code ? c.code.toUpperCase() : '',
                      label: `${c.flag || '🌍'} ${c.name} (${c.iso3 ? c.iso3.toUpperCase() : c.code ? c.code.toUpperCase() : ''})`,
                    }))}
                  />
                </TableHead>
                <TableHead className="py-2 font-normal normal-case">
                  <Input
                    placeholder="Operator name…"
                    value={operatorFilter}
                    onChange={(e) => {
                      setOperatorFilter(e.target.value)
                      setSystemOperatorIdFilter('')
                      setOperatorRawIdFilter('')
                    }}
                    className="h-8 text-xs font-normal"
                  />
                </TableHead>
                <TableHead className="py-2 font-normal normal-case">
                  <Input
                    placeholder="Search provider…"
                    value={providerFilter}
                    onChange={(e) => setProviderFilter(e.target.value)}
                    className="h-8 text-xs font-normal"
                  />
                </TableHead>
                <TableHead className="py-2 font-normal hidden normal-case">
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
                {showStatusToggle ? <TableHead className="py-2" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={tableColSpan} className="py-8 text-center text-muted-foreground">
                    Loading products…
                  </TableCell>
                </TableRow>
              ) : filteredPlans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tableColSpan} className="py-8 text-center text-muted-foreground">
                    No products match your filters. Sync providers to ingest plans from more countries.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPlans.map((plan) => (
                  <TableRow
                    key={plan.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => void openProviderCosts(plan.id)}
                  >
                    {showSelection ? (
                    <TableCell className="w-[50px]" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.includes(plan.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedIds((prev) => [...prev, plan.id])
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== plan.id))
                          }
                        }}
                      />
                    </TableCell>
                    ) : null}
                    <TableCell className="font-medium">{plan.plan_name}</TableCell>
                    <TableCell>
                      {plan.country_iso3 ? (
                        <>
                          {plan.country_iso3.toUpperCase()}{' '}
                          <span className="text-muted-foreground font-normal">
                            ({countryNameMap.get(plan.country_iso3.toUpperCase()) || countryDisplayName(plan.country_iso3)})
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{plan.operator_name || '—'}</TableCell>
                    <TableCell>
                      {(plan.provider_names ?? []).length > 0
                        ? displayProvidersCsv(plan.provider_names ?? [])
                        : '—'}
                    </TableCell>
                    <TableCell className="capitalize">{plan.category || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={plan.active ? 'default' : 'secondary'}>
                        {plan.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    {showStatusToggle ? (
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end items-center">
                        {togglingId === plan.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Switch
                            checked={plan.active}
                            onCheckedChange={() => void togglePlanStatus(plan.id, plan.active)}
                          />
                        )}
                      </div>
                    </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {sortedPlans.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40 mt-4">
              {/* Info text */}
              <div className="text-xs text-muted-foreground font-medium">
                Showing {Math.min((page - 1) * pageSize + 1, sortedPlans.length)} to{' '}
                {Math.min(page * pageSize, sortedPlans.length)} of {sortedPlans.length} products
              </div>

              {/* Navigation buttons & Rows selector */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Page Navigation */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={page === 1 || loading}
                  >
                    Previous
                  </Button>

                  {/* Page indicator */}
                  <span className="text-xs font-semibold px-2">
                    Page {page} of {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                    disabled={page === totalPages || loading}
                  >
                    Next
                  </Button>
                </div>

                {/* Rows per page selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Rows per page:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(val) => {
                      setPageSize(Number(val))
                      setPage(1)
                    }}
                    disabled={loading}
                  >
                    <SelectTrigger className="h-8 w-[70px] bg-background border-border/80 text-xs font-semibold">
                      <SelectValue placeholder={String(pageSize)} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Merge Confirmation Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <GitMerge className="size-5 text-primary animate-pulse" />
              Merge Selected Plans
            </DialogTitle>
            <DialogDescription>
              Consolidate duplicate plans into a single target plan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Selected Plans to Merge</Label>
              <div className="max-h-[150px] overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/20">
                {selectedPlans.map((p) => (
                  <div key={p.id} className="flex justify-between items-center text-xs px-2 py-1 bg-background border rounded-sm">
                    <span className="font-semibold truncate max-w-[200px]">{p.plan_name}</span>
                    <Badge variant="outline" className="scale-90">
                      {p.operator_name || '—'} ({p.country_iso3?.toUpperCase()})
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-plan" className="text-sm font-semibold">Primary Target Plan</Label>
              <Select value={targetPlanId} onValueChange={setTargetPlanId}>
                <SelectTrigger id="target-plan" className="w-full bg-background border-border/80">
                  <SelectValue placeholder="Select primary target plan" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.plan_name} ({p.operator_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                All selected plans will be merged into this target plan, and the others will be deleted.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)} disabled={merging}>
              Cancel
            </Button>
            <Button onClick={() => void handleMerge()} disabled={merging || !targetPlanId}>
              {merging ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Merging...
                </>
              ) : (
                'Merge'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plan details &amp; provider mapping</DialogTitle>
            <DialogDescription>
              System plan information and provider pricing for the selected plan.
            </DialogDescription>
          </DialogHeader>

          {costLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading provider comparison…
            </div>
          ) : costError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {costError}
            </div>
          ) : costBreakdown ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">System plan</p>
                  <p className="font-semibold text-base mt-1">
                    {costBreakdown.plan?.systemPlanName ?? costBreakdown.systemPlanName}
                  </p>
                </div>
                {costBreakdown.plan?.description ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Description</p>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{costBreakdown.plan.description}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {costBreakdown.plan?.validity ? (
                    <div>
                      <span className="text-muted-foreground">Validity: </span>
                      <span className="font-medium">{costBreakdown.plan.validity}</span>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-muted-foreground">System plan price: </span>
                    <span className="font-medium">
                      {formatMoney(
                        costBreakdown.plan?.systemPlanPrice ?? costBreakdown.systemPlanPrice,
                        costBreakdown.plan?.systemPlanCurrency ?? costBreakdown.systemPlanCurrency,
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status: </span>
                    <span className="font-medium">{costBreakdown.plan?.status ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Providers: </span>
                    <span className="font-medium">
                      {costBreakdown.plan?.providerCount ?? costBreakdown.providers.length}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                  System plan ID: {costBreakdown.plan?.systemPlanId ?? costBreakdown.systemPlanId}
                </p>
              </div>

              {costBreakdown.providers.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No provider plan mappings found for this system plan.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Provider Plan Name</TableHead>
                        <TableHead className="text-right">Recharge Value</TableHead>
                        <TableHead className="text-right">Provider Cost</TableHead>
                        <TableHead className="text-right">Fees</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Recharge Cost</TableHead>
                        <TableHead>Enabled</TableHead>
                        <TableHead className="text-right">Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costBreakdown.providers.map((provider) => (
                          <TableRow key={`${provider.providerId}:${provider.providerPlanId}`}>
                            <TableCell>
                              <div className="font-medium">
                                {displayProvider({
                                  id: provider.providerId,
                                  name: provider.providerName,
                                })}
                              </div>
                              <div className="text-xs text-muted-foreground">{provider.providerPlanId}</div>
                            </TableCell>
                            <TableCell>{provider.providerPlanName || provider.rawPlanName || '—'}</TableCell>
                            <TableCell className="text-right">
                              {formatMoney(
                                provider.providerRechargeValue,
                                provider.rechargeValueCurrency,
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {provider.mapping.providerCostDisplay}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(
                                sumProviderFees(provider.rechargeCost),
                                provider.rechargeCostCurrency,
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(
                                provider.rechargeCost.tax,
                                provider.rechargeCostCurrency,
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {provider.rechargeCostDisplay}
                            </TableCell>
                            <TableCell>
                              <Badge variant={provider.mapping.enabled ? 'default' : 'secondary'}>
                                {provider.mapping.enabled ? 'Yes' : 'No'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {provider.mapping.providerPriority ?? '—'}
                            </TableCell>
                          </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {costBreakdown.providers.some((p) => p.rawData) ? (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronDown className="h-3 w-3" />
                    View raw provider payloads
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    {costBreakdown.providers.map((provider) =>
                      provider.rawData ? (
                        <div key={`raw-${provider.providerId}:${provider.providerPlanId}`} className="rounded-md border p-3">
                          <p className="text-xs font-semibold mb-2">
                            {displayProvider({
                              id: provider.providerId,
                              name: provider.providerName,
                            })}{' '}
                            · {provider.providerPlanName || provider.providerPlanId}
                          </p>
                          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-[10px] leading-relaxed">
                            {JSON.stringify(provider.rawData, null, 2)}
                          </pre>
                        </div>
                      ) : null,
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCostDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
