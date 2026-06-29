'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCcw, Pencil, Trash2, ChevronsUpDown, Check, AlertTriangle } from 'lucide-react'
import { RoutingSubnav } from '@/app/admin/routing/_components/routing-subnav'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ROUTING_CATEGORY_LABELS } from '@/lib/routing/cascade-options'
import {
  ROUTING_ANY,
  fromNullableRuleField,
  toNullableRuleField,
} from '@/lib/routing/rule-form-options'
import { cn } from '@/lib/utils'
import { ModulePermissionShell } from '@/components/admin/module-permission-shell'
import { useAdminModulePermissions } from '@/lib/hooks/use-admin-module-permissions'
import { useProviderDisplay } from '@/components/admin/provider-display-context'

type Rule = {
  id: string
  ruleName: string
  countryId: string | null
  operatorId: string | null
  productType: string | null
  providerId: string
  providerCode?: string
  providerName?: string
  priority: number
  status: 'ACTIVE' | 'INACTIVE'
  effectiveFrom: string | null
  effectiveTo: string | null
}

type CountryOption = { iso3: string; label: string }
type OperatorOption = { id: string; label: string; countryId: string }
type ProductTypeOption = { value: string; label: string }
type CascadeProvider = { id: string; code: string; name: string; label: string }
type SelectOption = { value: string; label: string }

type RuleForm = {
  ruleName: string
  /** Multi-select: array of ISO3 codes. Empty = no country filter yet */
  countryIds: string[]
  operatorId: string
  providerId: string
  priority: number
}

function makeEmptyForm(rules: Rule[]): RuleForm {
  // Find the first unallocated priority slot (1-based; 0 = Unset sentinel, skip it)
  const taken = new Set(rules.filter((r) => r.priority > 0).map((r) => r.priority))
  let next = 1
  while (taken.has(next)) next++
  return {
    ruleName: '',
    countryIds: [],
    operatorId: ROUTING_ANY,
    providerId: '',
    priority: next,
  }
}

/** Parse a comma-separated countryId string from the API into an array */
function parseCountryIds(value: string | null): string[] {
  if (!value?.trim()) return []
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

function displayWildcard(value: string | null, label = 'Any') {
  return value?.trim() ? value : label
}

function isConcrete(value: string | null | undefined) {
  if (typeof value !== 'string') return false
  return value.trim() !== '' && value !== ROUTING_ANY
}

// Fetch operators directly via standard api
async function fetchOperators(countryIso3: string) {
  const res = await fetch(`/api/admin/routing-rules/options?country=${encodeURIComponent(countryIso3)}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Failed to load operators')
  return data
}

const PAGE_SIZE = 10

export default function RoutingRulesPage() {
  const { canCreate, canEdit } = useAdminModulePermissions('routing_rules')
  const { displayProvider } = useProviderDisplay()
  const showWriteCols = !!canEdit
  const tableColSpan = showWriteCols ? 8 : 6
  const [rules, setRules] = useState<Rule[]>([])
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [cascadeOperators, setCascadeOperators] = useState<OperatorOption[]>([])
  const [providers, setProviders] = useState<CascadeProvider[]>([])
  const [operatorLabelCache, setOperatorLabelCache] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [cascadeLoading, setCascadeLoading] = useState(false)
  const [noCommonOperator, setNoCommonOperator] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form, setForm] = useState<RuleForm>(() => makeEmptyForm([]))
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rulesRes, countriesRes, providersRes] = await Promise.all([
        fetch('/api/admin/routing-rules', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/countries', { cache: 'no-store' }),
        fetch('/api/admin/lcr/providers', { credentials: 'include', cache: 'no-store' })
      ])
      const rulesData = await rulesRes.json().catch(() => ({}))
      const countriesData = await countriesRes.json().catch(() => ({}))
      const providersData = await providersRes.json().catch(() => ({}))
      if (!rulesRes.ok) throw new Error(rulesData.error ?? 'Failed to load rules')
      setRules(Array.isArray(rulesData.rules) ? rulesData.rules : [])
      
      const mappedCountries = Array.isArray(countriesData.countries) 
        ? countriesData.countries.map((c: any) => ({ iso3: c.iso3, label: c.name }))
        : [];
      setCountries(mappedCountries);

      const mappedProviders = Array.isArray(providersData.providers)
        ? providersData.providers.filter((p: any) => p.is_active).map((p: any) => ({ id: p.id, code: p.code, name: p.name, label: p.name }))
        : [];
      setProviders(mappedProviders);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Load failed')
      setRules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const cacheOperatorLabels = useCallback((operators: OperatorOption[]) => {
    if (!operators.length) return
    setOperatorLabelCache((prev) => {
      const next = { ...prev }
      for (const o of operators) next[o.id] = o.label
      return next
    })
  }, [])

  /** Fetch operators for a single country (raw, no state mutation) */
  const fetchOperatorsForCountry = useCallback(async (countryIso3: string): Promise<OperatorOption[]> => {
    try {
      const data = await fetchOperators(countryIso3)
      return Array.isArray(data.operators) ? (data.operators as OperatorOption[]) : []
    } catch {
      return []
    }
  }, [])



  /** Load common operators for multiple countries and set cascade state */
  const loadCommonOperators = useCallback(
    async (countryIds: string[]): Promise<OperatorOption[]> => {
      if (countryIds.length === 0) {
        setCascadeOperators([])
        setNoCommonOperator(false)
        return []
      }
      setCascadeLoading(true)
      try {
        // Fetch operators for each country in parallel
        const results = await Promise.all(countryIds.map((id) => fetchOperatorsForCountry(id)))
        // Cache all operator labels
        for (const ops of results) cacheOperatorLabels(ops)

        if (results.length === 1) {
          setCascadeOperators(results[0])
          setNoCommonOperator(results[0].length === 0)
          return results[0]
        }
        // Find operators common to ALL selected countries
        const firstSet = results[0]
        const commonOperators = firstSet.filter((op) =>
          results.every((ops) => ops.some((o) => o.id === op.id))
        )
        setCascadeOperators(commonOperators)
        setNoCommonOperator(commonOperators.length === 0)
        return commonOperators
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load operators')
        setCascadeOperators([])
        setNoCommonOperator(false)
        return []
      } finally {
        setCascadeLoading(false)
      }
    },
    [fetchOperatorsForCountry, cacheOperatorLabels],
  )



  const countrySelected = form.countryIds.length > 0
  const operatorSelected = isConcrete(form.operatorId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rules
      .filter((r) => {
        if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
        if (!q) return true
        return (
          r.ruleName.toLowerCase().includes(q) ||
          (r.countryId ?? '').toLowerCase().includes(q) ||
          (r.operatorId ?? '').toLowerCase().includes(q) ||
          (r.providerCode ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        // Priority 0 = unset → always sink to bottom
        if (a.priority === 0 && b.priority === 0) return 0
        if (a.priority === 0) return 1
        if (b.priority === 0) return -1
        return a.priority - b.priority
      })
  }, [rules, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedRules = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  function resetCascade() {
    setCascadeOperators([])
    setNoCommonOperator(false)
  }

  function openCreate() {
    setEditing(null)
    setForm(makeEmptyForm(rules))
    resetCascade()
    setCountrySearch('')
    setDialogOpen(true)
  }

  function openEdit(rule: Rule) {
    setEditing(rule)
    const countryIds = parseCountryIds(rule.countryId)
    const operatorId = fromNullableRuleField(rule.operatorId)
    setForm({
      ruleName: rule.ruleName,
      countryIds,
      operatorId,
      providerId: rule.providerId,
      priority: rule.priority,
    })
    resetCascade()
    setCountrySearch('')
    setDialogOpen(true)
    if (countryIds.length > 0) {
      void loadCommonOperators(countryIds)
    }
  }

  /** Priority slots available for the current rule in the dialog */
  const priorityOptions = useMemo(() => {
    // Rules with priority > 0 held by OTHER rules (priority 0 = unset, doesn't occupy a slot)
    const takenByOthers = new Set(
      rules.filter((r) => r.id !== editing?.id && r.priority > 0).map((r) => r.priority)
    )
    // Total numbered slots = count of rules that hold a real slot, excluding self, + 1 for a new slot
    const activeSlots = rules.filter((r) => r.id !== editing?.id && r.priority > 0).length
    const total = activeSlots + 1
    const numbered = Array.from({ length: total }, (_, i) => i + 1).filter(
      (n) => !takenByOthers.has(n)
    )
    // 0 is always available as "Unset"
    return [0, ...numbered]
  }, [rules, editing])

  /** Toggle a country in/out of the multi-select */
  async function toggleCountry(iso3: string) {
    const current = form.countryIds
    const next = current.includes(iso3)
      ? current.filter((c) => c !== iso3)
      : [...current, iso3]
    setForm((f) => ({ ...f, countryIds: next, operatorId: ROUTING_ANY, providerId: '' }))
    resetCascade()
    if (next.length > 0) await loadCommonOperators(next)
  }

  /** Toggle all countries */
  async function toggleAllCountries() {
    const allSelected = form.countryIds.length === countries.length
    const next = allSelected ? [] : countries.map((c) => c.iso3)
    setForm((f) => ({ ...f, countryIds: next, operatorId: ROUTING_ANY, providerId: '' }))
    resetCascade()
    if (next.length > 0) await loadCommonOperators(next)
  }

  async function onOperatorChange(operatorId: string) {
    setForm((f) => ({
      ...f,
      operatorId,
      providerId: '',
    }))
  }

  async function saveRule() {
    if (!form.ruleName.trim()) {
      toast.error('Rule name is required')
      return
    }
    // Uniqueness check (case-insensitive, excluding the rule being edited)
    const duplicate = rules.some(
      (r) => r.id !== editing?.id && r.ruleName.trim().toLowerCase() === form.ruleName.trim().toLowerCase()
    )
    if (duplicate) {
      toast.error('A rule with this name already exists. Please use a unique name.')
      return
    }
    if (!form.providerId) {
      toast.error('Provider is required')
      return
    }
    setSaving(true)
    try {
      // Join multiple countries as comma-separated uppercase ISO3 codes
      const countryId =
        form.countryIds.length > 0
          ? form.countryIds.map((c) => c.toUpperCase()).join(',')
          : null
      const payload = {
        ruleName: form.ruleName.trim(),
        countryId,
        operatorId: toNullableRuleField(form.operatorId) ?? null,
        productType: null,
        providerId: form.providerId,
        priority: form.priority,
        status: editing?.status ?? 'ACTIVE',
      }
      const res = editing
        ? await fetch(`/api/admin/routing-rules/${encodeURIComponent(editing.id)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        : await fetch('/api/admin/routing-rules', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      toast.success(editing ? 'Rule updated' : 'Rule created')
      setDialogOpen(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleRuleStatus(rule: Rule, active: boolean) {
    setTogglingId(rule.id)
    try {
      const res = await fetch(`/api/admin/routing-rules/${encodeURIComponent(rule.id)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: active ? 'ACTIVE' : 'INACTIVE' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, status: active ? 'ACTIVE' : 'INACTIVE' } : r)),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed')
    } finally {
      setTogglingId(null)
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this routing rule?')) return
    try {
      const res = await fetch(`/api/admin/routing-rules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Delete failed')
      toast.success('Rule deleted')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed')
    }
  }

  function operatorLabel(operatorId: string | null) {
    if (!operatorId) return 'Any'
    return operatorLabelCache[operatorId] ?? operatorId.slice(0, 12)
  }

  /** Resolve a country ISO3 to its display label */
  function countryLabel(iso3: string) {
    return countries.find((c) => c.iso3 === iso3)?.label ?? iso3
  }

  /** Render the Country cell: first country + tooltip if multiple */
  function CountryCell({ countryId }: { countryId: string | null }) {
    const ids = parseCountryIds(countryId)
    if (ids.length === 0) return <span>Any</span>
    if (ids.length === 1) return <span>{countryLabel(ids[0])}</span>
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default underline decoration-dotted">
            {countryLabel(ids[0])} +{ids.length - 1}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {ids.map((id) => countryLabel(id)).join(', ')}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Filtered country list for the popover search
  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase()
    if (!q) return countries
    return countries.filter((c) => c.label.toLowerCase().includes(q) || c.iso3.toLowerCase().includes(q))
  }, [countries, countrySearch])

  const allCountriesSelected = countries.length > 0 && form.countryIds.length === countries.length
  const someCountriesSelected = form.countryIds.length > 0 && !allCountriesSelected

  // Country trigger label
  const countryTriggerLabel = useMemo(() => {
    if (form.countryIds.length === 0) return 'Select countries'
    if (form.countryIds.length === 1) return countryLabel(form.countryIds[0])
    if (allCountriesSelected) return 'All countries'
    return `${form.countryIds.length} countries selected`
  }, [form.countryIds, allCountriesSelected, countries])

  return (
    <ModulePermissionShell module="routing_rules" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Routing Rules</h1>
          <p className="text-muted-foreground">Force a provider for matching transactions and skip LCR.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
          {canCreate ? (
          <Button onClick={openCreate} disabled={!countries.length} data-perm="create">
            <Plus className="mr-2 size-4" />
            Add rule
          </Button>
          ) : null}
        </div>
      </div>

      <RoutingSubnav />

      <Card>
        <CardHeader>
          <CardTitle>Active rules</CardTitle>
          <CardDescription>
            Select countries → operator → product type → provider. Lower priority number wins first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search rules…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="w-full min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[15%]">Rule</TableHead>
                <TableHead className="w-[10%]">Country</TableHead>
                <TableHead className="w-[10%]">Operator</TableHead>
                <TableHead className="w-[10%]">Provider</TableHead>
                <TableHead className="w-[10%]">Priority</TableHead>
                {showWriteCols ? (
                <>
                <TableHead className="w-[8%]" data-perm-col="edit">Enabled</TableHead>
                <TableHead className="w-[8%] text-right pr-4" data-perm-col="edit">Actions</TableHead>
                </>
                ) : (
                <TableHead className="w-[8%]">Status</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={tableColSpan} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tableColSpan} className="py-8 text-center text-muted-foreground">
                    No routing rules found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.ruleName}</TableCell>
                    <TableCell>
                      <CountryCell countryId={rule.countryId} />
                    </TableCell>
                    <TableCell>{operatorLabel(rule.operatorId)}</TableCell>
                    <TableCell>
                      {displayProvider({
                        id: rule.providerId,
                        code: rule.providerCode,
                        name: rule.providerName,
                      })}
                    </TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    {showWriteCols ? (
                    <>
                    <TableCell data-perm-col="edit">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.status === 'ACTIVE'}
                          disabled={togglingId === rule.id}
                          onCheckedChange={(v) => void toggleRuleStatus(rule, v)}
                          className="scale-90"
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {rule.status === 'ACTIVE' ? 'On' : 'Off'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell data-perm-col="edit">
                      <div className="flex justify-end gap-1 sm:gap-2">
                        {canEdit ? (
                        <Button variant="outline" size="sm" onClick={() => openEdit(rule)} title="Edit" data-perm="edit">
                          <Pencil className="size-4 sm:mr-2" /> <span className="hidden sm:inline">Edit</span>
                        </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    </>
                    ) : (
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{rule.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
                    </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit routing rule' : 'Create routing rule'}</DialogTitle>
            <DialogDescription>
              Pick countries, then operator. Pick from any of the active providers.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Rule name */}
            <div className="space-y-2">
              <Label>Rule name</Label>
              <Input
                placeholder="Enter a unique rule name…"
                value={form.ruleName}
                onChange={(e) => setForm((f) => ({ ...f, ruleName: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Country multi-select */}
              <div className="space-y-2">
                <Label>Countries</Label>
                <Popover open={countryPopoverOpen} onOpenChange={setCountryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={countryPopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate text-left">{countryTriggerLabel}</span>
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0 overflow-hidden flex flex-col" align="start">
                    <div className="border-b p-2 shrink-0">
                      <Input
                        placeholder="Search countries…"
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    {/* Select all row */}
                    <div className="border-b px-3 py-2 shrink-0">
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={allCountriesSelected}
                          data-state={someCountriesSelected ? 'indeterminate' : undefined}
                          onCheckedChange={() => void toggleAllCountries()}
                        />
                        Select all
                      </label>
                    </div>
                    <div 
                      className="flex-1 overflow-y-auto overscroll-contain py-1" 
                      style={{ maxHeight: '224px' }}
                      onWheel={(e) => e.stopPropagation()}
                    >
                      {filteredCountries.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">No countries found</p>
                      ) : (
                        filteredCountries.map((c) => (
                          <label
                            key={c.iso3}
                            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                          >
                            <Checkbox
                              checked={form.countryIds.includes(c.iso3)}
                              onCheckedChange={() => void toggleCountry(c.iso3)}
                            />
                            {c.label}
                          </label>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Operator */}
              <div className="space-y-2">
                <Label>Operator</Label>
                {noCommonOperator ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {form.countryIds.length === 1
                      ? 'There are no operators for the selected country'
                      : 'No common operators for the selected countries'}
                  </div>
                ) : (
                  <Select
                    value={form.operatorId}
                    disabled={!countrySelected || cascadeLoading}
                    onValueChange={(v) => void onOperatorChange(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={countrySelected ? (cascadeLoading ? 'Loading…' : 'Select operator') : 'Select countries first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {cascadeOperators.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={String(form.priority)}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {String(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Lower number = higher priority</p>
              </div>

              {/* Provider */}
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={form.providerId}
                  disabled={providers.length === 0}
                  onValueChange={(v) => setForm((f) => ({ ...f, providerId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        providers.length === 0
                          ? 'No providers found'
                          : 'Select provider'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {displayProvider({ id: p.id, code: p.code, name: p.name })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveRule()} disabled={saving || cascadeLoading}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModulePermissionShell>
  )
}
