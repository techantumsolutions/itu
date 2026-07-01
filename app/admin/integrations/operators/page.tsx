'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCcw, Search, Loader2, GitMerge, Play, CheckCircle2, XCircle, AlertCircle, GitFork, Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Pencil,
  Power,
  PowerOff
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/stores'
import { clientHasAdminPermission } from '@/lib/auth/client-features'
import { useProviderDisplay } from '@/components/admin/provider-display-context'

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

export function ConfidenceBadge({ value }: { value: unknown }) {
  const label = String(value ?? 'UNKNOWN').trim().toUpperCase()

  let variantClass = 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20 font-semibold'
  if (label.includes('HIGH')) {
    variantClass = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-semibold'
  } else if (label.includes('MEDIUM')) {
    variantClass = 'bg-blue-500/10 text-blue-500 border-blue-500/20 font-semibold'
  } else if (label.includes('LOW')) {
    variantClass = 'bg-amber-500/10 text-amber-500 border-amber-500/20 font-semibold'
  } else if (label.includes('SUSPICIOUS')) {
    variantClass = 'bg-orange-500/10 text-orange-500 border-orange-500/20 font-semibold'
  } else if (label.includes('CONFIRMED_NON')) {
    variantClass = 'bg-red-500/10 text-red-500 border-red-500/20 font-semibold'
  }

  const displayLabel = label
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return (
    <Badge variant="outline" className={`whitespace-nowrap ${variantClass}`}>
      {displayLabel}
    </Badge>
  )
}

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

  const displayLabel = value === 'ALL' || value === 'all' ? allLabel : (options.find((o) => o.value === value)?.label ?? value)

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setTimeout(() => inputRef.current?.focus(), 50) }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground border-border/80',
            !value || value === 'ALL' || value === 'all' ? 'text-muted-foreground' : '',
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="border-b px-3 py-2">
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${placeholder.toLowerCase()}…`}
            className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[220px] overflow-y-auto p-1">
          <button
            type="button"
            className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent text-left', (value === 'ALL' || value === 'all') && 'font-semibold')}
            onClick={() => { onValueChange('ALL'); setOpen(false); setSearch('') }}
          >
            {value === 'ALL' || value === 'all' ? <Check className="h-4 w-4" /> : <span className="w-4" />}
            {allLabel}
          </button>
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent text-left', value === opt.value && 'font-semibold')}
              onClick={() => { onValueChange(opt.value); setOpen(false); setSearch('') }}
            >
              {value === opt.value ? <Check className="h-4 w-4" /> : <span className="w-4" />}
              {opt.label}
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">No results</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function productsHrefForOperator(row: { id: string; mainName: string }, tab: 'system' | 'provider') {
  const q = new URLSearchParams({
    operatorName: row.mainName.trim(),
    from: 'operators',
    tab,
  })
  if (tab === 'system') {
    q.set('systemOperatorId', row.id)
  } else {
    q.set('operatorRawId', row.id)
  }
  return `/admin/products?${q.toString()}`
}

export default function OperatorsPage() {
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const { displayProvider, displayProvidersCsv, displayProviderOption } = useProviderDisplay()
  const canSync = user && clientHasAdminPermission(user, 'operators.sync')
  const canEdit = user && clientHasAdminPermission(user, 'operators.edit')
  const canCreate = user && clientHasAdminPermission(user, 'operators.create')
  const canDelete = user && clientHasAdminPermission(user, 'operators.delete')
  const showSelection = !!canEdit
  const showRowActions = !!canEdit
  const [rawOperators, setRawOperators] = useState<any[]>([])
  const [systemOperators, setSystemOperators] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [countriesList, setCountriesList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Status toggle confirmation states
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false)
  const [statusTargetId, setStatusTargetId] = useState('')
  const [statusTargetName, setStatusTargetName] = useState('')
  const [statusTargetCurrentStatus, setStatusTargetCurrentStatus] = useState('')

  // Edit name states
  const [editNameOpen, setEditNameOpen] = useState(false)
  const [editTargetId, setEditTargetId] = useState('')
  const [editTargetName, setEditTargetName] = useState('')
  const [newOperatorName, setNewOperatorName] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Filters state
  const [dataType, setDataType] = useState<'system' | 'provider'>('system')

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'system' || tab === 'provider') setDataType(tab)
  }, [searchParams])
  const [providerFilter, setProviderFilter] = useState('ALL')
  const [countryFilter, setCountryFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE')

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Multi-select & Merge states
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [targetOperatorId, setTargetOperatorId] = useState<string>('')
  const [merging, setMerging] = useState(false)

  const endpoint = '/api/admin/aggregator/operators'

  // Pipeline Step States
  const [pipelineSteps, setPipelineSteps] = useState<any[]>([
    {
      key: 'step1_check',
      label: 'Step 1: Connection Check',
      description: 'Verify adapter connection status and loaded credentials.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step2_fetch',
      label: 'Step 2: API Fetch & Raw Store',
      description: 'Fetch operator/plan API payloads and store entirely raw in DB.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step3_countries',
      label: 'Step 3: Staging Normalize',
      description: 'Normalize operators by country ISO3 into agg_operators and agg_plans.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step4_normalize',
      label: 'Step 4: Registry Domain Filter',
      description: 'Activate operators found in domain_operator_registry; inactivate others and sync plan status.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step4_apply_merge_history',
      label: 'Step 4b: Apply Merge History',
      description: 'Reuse prior admin operator merge decisions to canonicalize staging operators before name cleanup.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step5_filter_telecom',
      label: 'Step 5: Strip Country Affixes',
      description: 'Remove country name, ISO2, and ISO3 prefix/suffix from active operator names.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step6_merge',
      label: 'Step 6: Merge Duplicate Operators',
      description: 'Merge same-name active operators in each country and reassign their plans.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step7_promote',
      label: 'Step 7: Filter 3 (Promote to Live Catalog)',
      description: 'Inactivate empty operators. Promote remaining active items to system tables.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step7_merge_duplicates',
      label: 'Step 7.5: Merge Duplicate Plans',
      description: 'Auto-merge duplicate system_plans by signature and recharge identity before final validation.',
      status: 'idle',
      message: '',
    },
    {
      key: 'step8_filter_benefits',
      label: 'Step 8: Plan Benefit Filtering',
      description: 'Clean promoted system_plans that do not contain mobile/data benefits.',
      status: 'idle',
      message: '',
    },
  ])
  const [selectedPipelineProviderId, setSelectedPipelineProviderId] = useState<string>('')

  // Set default provider when providers list loads
  useEffect(() => {
    if (providers.length > 0 && !selectedPipelineProviderId) {
      setSelectedPipelineProviderId(providers[0].id)
    }
  }, [providers, selectedPipelineProviderId])

  const runPipelineStep = async (stepKey: string) => {
    if (!selectedPipelineProviderId) {
      toast.error('Please select a provider first.')
      return
    }

    setPipelineSteps((prev) =>
      prev.map((s) => (s.key === stepKey ? { ...s, status: 'running', message: 'Executing step...' } : s))
    )

    try {
      const res = await fetch('/api/admin/aggregator/sync-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: stepKey,
          providerId: selectedPipelineProviderId,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute step')
      }

      setPipelineSteps((prev) =>
        prev.map((s) =>
          s.key === stepKey
            ? { ...s, status: data.success ? 'success' : 'failed', message: data.message || 'Done' }
            : s
        )
      )
      toast.success('Step executed successfully.')
      await load(true)
    } catch (err: any) {
      setPipelineSteps((prev) =>
        prev.map((s) => (s.key === stepKey ? { ...s, status: 'failed', message: err.message || 'Error' } : s))
      )
      toast.error(err.message || 'Step execution failed.')
    }
  }

  const resetPipelineSteps = () => {
    setPipelineSteps((prev) => prev.map((s) => ({ ...s, status: 'idle', message: '' })))
  }

  // Create a map from country code (both 2-letter and 3-letter) to country name
  const countryNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of countriesList) {
      if (c.name) {
        if (c.iso3) map.set(c.iso3.trim().toUpperCase(), c.name.trim())
        if (c.code) map.set(c.code.trim().toUpperCase(), c.name.trim())
      }
    }
    return map
  }, [countriesList])

  // Fetch static countries on mount for dropdown
  useEffect(() => {
    fetch('/api/countries', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.countries)) {
          setCountriesList(data.countries)
        }
      })
      .catch(() => { })
  }, [])

  const load = async (
    isRefresh = false,
    country = countryFilter,
    provider = providerFilter,
    queryText = search,
    status = statusFilter,
    currentDataType = dataType
  ) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    const params = new URLSearchParams()
    if (country !== 'ALL') params.set('country', country)
    if (provider !== 'ALL') params.set('providerId', provider)
    if (queryText.trim()) params.set('q', queryText.trim())
    if (currentDataType === 'system') {
      if (status !== 'ALL') params.set('status', status)
    }

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
      void load(false, countryFilter, providerFilter, search, statusFilter, dataType)
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [countryFilter, providerFilter, search, statusFilter, dataType])

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

  // Sync System Operators from raw tables locally
  const triggerLocalSync = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/aggregator/operators/sync-local', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: providerFilter }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      toast.success(data.message || 'Local operator sync started in background')
      await load(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setRefreshing(false)
    }
  }

  const toggleSystemOperatorStatus = async (id: string, currentStatus: string) => {
    setTogglingId(id)
    const opStatus = String(currentStatus ?? '').trim().toUpperCase()
    const isActive = ['ACTIVE', 'ONLINE', 'TRUE'].includes(opStatus)
    const newStatus = isActive ? 'INACTIVE' : 'ACTIVE'
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

  const confirmToggleStatus = async () => {
    setStatusConfirmOpen(false)
    if (statusTargetId) {
      await toggleSystemOperatorStatus(statusTargetId, statusTargetCurrentStatus)
    }
  }

  const handleSaveName = async () => {
    if (!newOperatorName.trim()) {
      toast.error('Name cannot be empty')
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/admin/aggregator/operators/${editTargetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_operator_name: newOperatorName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to update name')

      // Update local state directly
      setSystemOperators((prev) =>
        prev.map((op) => (op.id === editTargetId ? { ...op, system_operator_name: newOperatorName.trim() } : op))
      )
      toast.success('Operator name updated successfully')
      setEditNameOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  // Reset provider and country filter if they are not available in current tab data
  useEffect(() => {
    setProviderFilter('ALL')
    setCountryFilter('ALL')
    setStatusFilter('ACTIVE')
    setSelectedIds([])
  }, [dataType])

  // Map backend operators to normalized rows for local rendering (backend does the filtering)
  const renderedRows = useMemo(() => {
    let list = dataType === 'system' ? systemOperators : rawOperators

    if (dataType === 'system' && statusFilter !== 'ALL') {
      list = list.filter((op) => {
        const opStatus = String(op.status ?? '').trim().toUpperCase()
        const filterStatus = String(statusFilter ?? '').trim().toUpperCase()
        const isActiveOp = ['ACTIVE', 'ONLINE', 'TRUE'].includes(opStatus)
        const isActiveFilter = filterStatus === 'ACTIVE'
        return isActiveOp === isActiveFilter
      })
    }

    let mapped: any[] = []
    if (dataType === 'system') {
      mapped = list.map((op) => ({
        id: op.id,
        mainName: op.system_operator_name,
        secondaryText: op.slug,
        providerNames: (op.mappedProviderNames ?? []).filter(Boolean) as string[],
        providerIds: (op.mappedProviderIds ?? []) as string[],
        countryCode: op.country_id,
        operatorType: op.operator_type || '—',
        status: op.status,
        dateValue: op.updated_at || op.created_at,
        isSystem: true,
        confidenceLevel: op.confidence_level || 'UNKNOWN',
      }))
    } else {
      mapped = list.map((op) => ({
        id: op.id,
        mainName: op.provider_operator_name,
        providerOperatorId: op.provider_operator_id,
        providerRefName: op.provider_name ?? null,
        providerId: op.service_provider_id ?? null,
        countryCode: op.iso_code || op.country_code,
        operatorType: op.operator_type || '—',
        status: op.status,
        dateValue: op.fetched_at,
        isSystem: false,
      }))
    }

    // Sort by Country Name (A-Z) and then Operator Name (A-Z)
    return mapped.sort((a, b) => {
      const codeA = String(a.countryCode ?? '').trim().toUpperCase()
      const codeB = String(b.countryCode ?? '').trim().toUpperCase()

      const countryNameA = countryNameMap.get(codeA) || codeA
      const countryNameB = countryNameMap.get(codeB) || codeB

      const comp = countryNameA.localeCompare(countryNameB, undefined, { sensitivity: 'base' })
      if (comp !== 0) return comp

      const nameA = String(a.mainName ?? '').trim().toUpperCase()
      const nameB = String(b.mainName ?? '').trim().toUpperCase()

      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
    })
  }, [systemOperators, rawOperators, dataType, statusFilter, countryNameMap])

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return renderedRows.slice(startIndex, startIndex + pageSize)
  }, [renderedRows, currentPage, pageSize])

  // Reset page to 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [countryFilter, providerFilter, search, statusFilter, dataType, pageSize])

  const selectedOperators = useMemo(() => {
    return systemOperators.filter((op) => selectedIds.includes(op.id))
  }, [systemOperators, selectedIds])

  const handleMerge = async () => {
    if (!targetOperatorId) {
      toast.error('Please select a target operator')
      return
    }
    const sourceOperatorIds = selectedIds.filter((id) => id !== targetOperatorId)
    if (sourceOperatorIds.length === 0) {
      toast.error('At least one source operator must be merged')
      return
    }

    setMerging(true)
    try {
      const res = await fetch('/api/admin/aggregator/operators/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetOperatorId,
          sourceOperatorIds,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Merge failed')

      toast.success('Operators merged successfully')
      setMergeDialogOpen(false)
      setSelectedIds([])
      setTargetOperatorId('')
      await load(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to merge operators')
    } finally {
      setMerging(false)
    }
  }

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
          {canSync ? (
          <Button onClick={() => void triggerSyncAll()} disabled={loading || refreshing}>
            {refreshing ? 'Syncing…' : 'Sync all providers'}
          </Button>
          ) : null}
          {canSync && dataType === 'system' ? (
            <Button variant="secondary" onClick={() => void triggerLocalSync()} disabled={loading || refreshing}>
              Sync System Operators
            </Button>
          ) : null}
        </div>
      </div>

      {/* 
      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-zinc-900/50 to-zinc-950/80 mb-6">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <GitFork className="size-5 text-primary" />
            Manual Staging Ingestion Pipeline
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Select a provider and run the staging pipeline stages manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1.5 w-[240px]">
              <span className="text-xs font-semibold text-zinc-400">Active Ingestion Provider</span>
              <Select value={selectedPipelineProviderId} onValueChange={setSelectedPipelineProviderId}>
                <SelectTrigger className="bg-background border-border/80">
                  <SelectValue placeholder="Select Ingestion Provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {displayProviderOption({
                        id: p.id,
                        code: p.code,
                        name: p.name,
                        priority: Number(p.priority) || 0,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="mt-5" onClick={resetPipelineSteps}>
              Reset Timeline
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {pipelineSteps.map((step, idx) => (
              <div
                key={step.key}
                className={`flex flex-col justify-between p-4 rounded-lg border transition-all duration-200 ${
                  step.status === 'running'
                    ? 'border-primary/60 bg-primary/5 shadow-md shadow-primary/5'
                    : step.status === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : step.status === 'failed'
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-border/60 bg-background/50'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">STAGE {idx + 1}</span>
                    {step.status === 'running' && <Loader2 className="size-4 animate-spin text-primary" />}
                    {step.status === 'success' && <CheckCircle2 className="size-4 text-emerald-500" />}
                    {step.status === 'failed' && <XCircle className="size-4 text-red-500" />}
                    {step.status === 'idle' && <AlertCircle className="size-4 text-zinc-500" />}
                  </div>
                  <h4 className="font-semibold text-sm leading-tight">{step.label}</h4>
                  <p className="text-xs text-muted-foreground leading-normal">{step.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/30 flex flex-col gap-2">
                  {step.message && (
                    <div className="text-[10px] font-mono leading-tight max-h-[48px] overflow-y-auto break-words bg-zinc-950/40 p-1.5 rounded border border-border/30">
                      {step.message}
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="w-full text-xs font-semibold"
                    variant={step.status === 'success' ? 'secondary' : 'default'}
                    disabled={step.status === 'running' || !selectedPipelineProviderId}
                    onClick={() => void runPipelineStep(step.key)}
                  >
                    <Play className="mr-1.5 size-3" />
                    {step.status === 'success' ? 'Run Again' : 'Run Stage'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      */}

      <Card className="border-border/60 shadow-sm">
        {/* <CardHeader className="pb-3">
          <CardTitle>Operators List</CardTitle>
          <CardDescription>
            <Link href="/admin/integrations" className="font-medium text-primary hover:underline">
              Back to integrations
            </Link>
          </CardDescription>
        </CardHeader> */}
        <CardContent className="space-y-4">

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center gap-3">

            {/* Search Input */}
            <div className="relative col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-1">
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
                <SelectTrigger className="w-full bg-background border-border/80 font-medium">
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
                <SelectTrigger className="w-[180px] bg-background border-border/80 w-full">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Providers</SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {displayProviderOption({
                        id: p.id,
                        code: p.code,
                        name: p.name,
                        priority: Number(p.priority) || 0,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter - Only show for System Operator */}
            {dataType === 'system' && (
              <div className="flex flex-col gap-1">
                <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                  <SelectTrigger className="w-[180px] bg-background border-border/80 w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}



            {/* Country Filter */}
            <div className="flex flex-col gap-1">
              <ComboFilter
                value={countryFilter}
                onValueChange={setCountryFilter}
                placeholder="Country"
                allLabel="All Countries"
                options={countriesList.map((c) => ({
                  value: c.iso3 ? c.iso3.toUpperCase() : c.code ? c.code.toUpperCase() : '',
                  label: `${c.flag || '🌍'} ${c.name} (${c.iso3 ? c.iso3.toUpperCase() : c.code ? c.code.toUpperCase() : ''})`,
                }))}
              />
            </div>
          </div>
          {/* Counts info / Merge Operators action */}
          <div className='w-full flex justify-end'>
            {canEdit && selectedIds.length >= 2 && dataType === 'system' ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setTargetOperatorId(selectedIds[0] || '')
                  setMergeDialogOpen(true)
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm font-semibold ml-auto animate-fade-in"
              >
                <GitMerge className="mr-2 size-4" />
                Merge Operators ({selectedIds.length})
              </Button>
            ) : !loading ? (
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
                  {showSelection && dataType === 'system' ? (
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={
                          paginatedRows.length > 0 &&
                          paginatedRows.every((row) => selectedIds.includes(row.id))
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const paginatedIds = paginatedRows.map((r) => r.id)
                            setSelectedIds((prev) => Array.from(new Set([...prev, ...paginatedIds])))
                          } else {
                            const paginatedIds = paginatedRows.map((r) => r.id)
                            setSelectedIds((prev) => prev.filter((id) => !paginatedIds.includes(id)))
                          }
                        }}
                      />
                    </TableHead>
                  ) : null}
                  <TableHead className="font-semibold text-muted-foreground">Operator</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Provider</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Country</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">
                    {dataType === 'system' ? 'Updated' : 'Fetched'}
                  </TableHead>
                  {showRowActions ? (
                  <TableHead className="font-semibold text-muted-foreground text-right w-[240px] min-w-[240px]">Actions</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={showSelection && dataType === 'system' ? (showRowActions ? 7 : 6) : (showRowActions ? 6 : 5)} className="py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span>Loading operators data...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={dataType === 'system' ? (showRowActions ? 7 : 6) : (showRowActions ? 6 : 5)} className="py-12 text-center text-muted-foreground font-medium">
                      No records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row) => {
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                        {showSelection && dataType === 'system' ? (
                          <TableCell className="w-[50px]">
                            <Checkbox
                              checked={selectedIds.includes(row.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedIds((prev) => [...prev, row.id])
                                } else {
                                  setSelectedIds((prev) => prev.filter((id) => id !== row.id))
                                }
                              }}
                            />
                          </TableCell>
                        ) : null}

                        {/* Operator Column */}
                        <TableCell>
                          <div className="min-w-0 leading-tight">
                            <div className="truncate font-semibold text-foreground">{row.mainName}</div>
                            {dataType === 'provider' && row.providerOperatorId ? (
                              <div className="truncate text-xs text-muted-foreground mt-0.5 font-mono">
                                {row.providerOperatorId} (
                                {displayProvider({
                                  id: row.providerId,
                                  name: row.providerRefName ?? 'Raw',
                                })}
                                )
                              </div>
                            ) : row.secondaryText ? (
                              <div className="truncate text-xs text-muted-foreground mt-0.5 font-mono">
                                {row.secondaryText}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>

                        {/* Provider Column */}
                        <TableCell>
                          <span className="text-sm text-foreground">
                            {dataType === 'system'
                              ? (row.providerIds?.length
                                  ? row.providerIds
                                      .map((id: string, idx: number) =>
                                        displayProvider({
                                          id,
                                          name: row.providerNames?.[idx] ?? undefined,
                                        }),
                                      )
                                      .join(', ')
                                  : row.providerNames?.length
                                    ? displayProvidersCsv(row.providerNames)
                                    : '—')
                              : displayProvider({
                                  id: row.providerId,
                                  name: row.providerRefName ?? undefined,
                                })}
                          </span>
                        </TableCell>

                        {/* Country Column */}
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-sm text-foreground">
                              {countryNameMap.get((String(row.countryCode ?? '').trim().toUpperCase())) || '—'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono font-medium">
                              {String(row.countryCode ?? '—').toUpperCase()}
                            </span>
                          </div>
                        </TableCell>



                        {/* Status Column */}
                        <TableCell>
                          <StatusBadge value={row.status} />
                        </TableCell>

                        {/* Date Column */}
                        <TableCell>
                          <CompactDateTime value={row.dateValue} />
                        </TableCell>

                        {showRowActions ? (
                        <TableCell className="text-right w-[240px] min-w-[240px]">
                          <div className="flex justify-end items-center gap-2 flex-row whitespace-nowrap">
                            {canEdit && dataType === 'system' && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Edit Operator Name"
                                  className="h-8 w-8 text-blue-500 hover:bg-blue-500/10"
                                  onClick={() => {
                                    setEditTargetId(row.id)
                                    setEditTargetName(row.mainName)
                                    setNewOperatorName(row.mainName)
                                    setEditNameOpen(true)
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title={row.status === 'ACTIVE' ? 'Deactivate Operator' : 'Activate Operator'}
                                  className={`h-8 w-8 ${row.status === 'ACTIVE'
                                    ? 'text-emerald-500 hover:bg-emerald-500/10'
                                    : 'text-slate-500 hover:bg-slate-500/10'
                                    }`}
                                  onClick={() => {
                                    setStatusTargetId(row.id)
                                    setStatusTargetName(row.mainName)
                                    setStatusTargetCurrentStatus(row.status)
                                    setStatusConfirmOpen(true)
                                  }}
                                  disabled={togglingId === row.id}
                                >
                                  {togglingId === row.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : row.status === 'ACTIVE' ? (
                                    <Power className="h-4 w-4" />
                                  ) : (
                                    <PowerOff className="h-4 w-4" />
                                  )}
                                </Button>
                              </>
                            )}
                            <Button size="sm" variant="outline" className="h-8 text-xs font-medium" asChild>
                              <Link href={productsHrefForOperator({ id: row.id, mainName: row.mainName }, dataType)}>
                                Plans
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                        ) : (
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" className="h-8 text-xs font-medium" asChild>
                            <Link href={productsHrefForOperator({ id: row.id, mainName: row.mainName }, dataType)}>
                              Plans
                            </Link>
                          </Button>
                        </TableCell>
                        )}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {renderedRows.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40 mt-4">
              {/* Info text */}
              <div className="text-xs text-muted-foreground font-medium">
                Showing {Math.min((currentPage - 1) * pageSize + 1, renderedRows.length)} to{' '}
                {Math.min(currentPage * pageSize, renderedRows.length)} of {renderedRows.length} operators
              </div>

              {/* Navigation buttons & Rows selector */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Page Navigation */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  
                  {/* Page indicator */}
                  <span className="text-xs font-semibold px-2">
                    Page {currentPage} of {Math.ceil(renderedRows.length / pageSize) || 1}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, Math.ceil(renderedRows.length / pageSize)))}
                    disabled={currentPage === Math.ceil(renderedRows.length / pageSize) || Math.ceil(renderedRows.length / pageSize) === 0}
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
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="h-8 w-[70px] bg-background border-border/80 text-xs font-semibold">
                      <SelectValue placeholder={String(pageSize)} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
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

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary" />
              Merge Operators
            </DialogTitle>
            <DialogDescription>
              Combine multiple system operators into a single target operator. This will update all operator and plan mappings.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Selected Operators to Merge</Label>
              <div className="max-h-[150px] overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/20">
                {selectedOperators.map((op) => (
                  <div key={op.id} className="flex justify-between items-center text-xs px-2 py-1 bg-background border rounded-sm">
                    <span className="font-semibold truncate max-w-[220px]">{op.system_operator_name}</span>
                    <Badge variant="outline" className="font-mono scale-90">
                      {countryNameMap.get((String(op.country_id ?? '').trim().toUpperCase())) || op.country_id}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-operator" className="text-sm font-semibold">Primary Target Operator</Label>
              <Select value={targetOperatorId} onValueChange={setTargetOperatorId}>
                <SelectTrigger id="target-operator" className="w-full bg-background border-border/80">
                  <SelectValue placeholder="Select primary target operator" />
                </SelectTrigger>
                <SelectContent>
                  {selectedOperators.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.system_operator_name} ({countryNameMap.get((String(op.country_id ?? '').trim().toUpperCase())) || op.country_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                All selected operators will be merged into this target operator, and the others will be deleted.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)} disabled={merging}>
              Cancel
            </Button>
            <Button onClick={() => void handleMerge()} disabled={merging || !targetOperatorId}>
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

      {/* Status Toggle Confirmation Dialog */}
      <Dialog open={statusConfirmOpen} onOpenChange={setStatusConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Status Change</DialogTitle>
            <DialogDescription>
              Are you sure you want to {statusTargetCurrentStatus === 'ACTIVE' ? 'deactivate' : 'activate'} the operator <strong>{statusTargetName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setStatusConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={statusTargetCurrentStatus === 'ACTIVE' ? 'destructive' : 'default'}
              onClick={() => void confirmToggleStatus()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Operator Name Dialog */}
      <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Operator Name</DialogTitle>
            <DialogDescription>
              Update the display name of <strong>{editTargetName}</strong>. This changes the name in the system operators catalog.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="operator-name" className="text-sm font-semibold">Operator Name</Label>
              <Input
                id="operator-name"
                value={newOperatorName}
                onChange={(e) => setNewOperatorName(e.target.value)}
                className="bg-background border-border/80 focus-visible:ring-primary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNameOpen(false)} disabled={savingName}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveName()} disabled={savingName || !newOperatorName.trim()}>
              {savingName ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
