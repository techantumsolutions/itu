'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCcw, Pencil, Trash2 } from 'lucide-react'
import { RoutingSubnav } from '@/app/admin/routing/_components/routing-subnav'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ROUTING_CATEGORY_LABELS } from '@/lib/routing/cascade-options'
import {
  ROUTING_ANY,
  ROUTING_RULE_NAME_OPTIONS,
  fromNullableRuleField,
  toNullableRuleField,
} from '@/lib/routing/rule-form-options'

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
  countryId: string
  operatorId: string
  productType: string
  providerId: string
  priority: number
}

const emptyForm: RuleForm = {
  ruleName: ROUTING_RULE_NAME_OPTIONS[0].value,
  countryId: ROUTING_ANY,
  operatorId: ROUTING_ANY,
  productType: ROUTING_ANY,
  providerId: '',
  priority: 100,
}

function displayWildcard(value: string | null, label = 'Any') {
  return value?.trim() ? value : label
}

function isConcrete(value: string) {
  return value.trim() !== '' && value !== ROUTING_ANY
}

async function fetchCascade(path: string) {
  const res = await fetch(`/api/admin/routing-rules/options${path}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Failed to load options')
  return data
}

const PAGE_SIZE = 10

export default function RoutingRulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [cascadeOperators, setCascadeOperators] = useState<OperatorOption[]>([])
  const [cascadeProductTypes, setCascadeProductTypes] = useState<ProductTypeOption[]>([])
  const [cascadeProviders, setCascadeProviders] = useState<CascadeProvider[]>([])
  const [operatorLabelCache, setOperatorLabelCache] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [cascadeLoading, setCascadeLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form, setForm] = useState<RuleForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rulesRes, optionsRes] = await Promise.all([
        fetch('/api/admin/routing-rules', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/routing-rules/options', { credentials: 'include', cache: 'no-store' }),
      ])
      const rulesData = await rulesRes.json().catch(() => ({}))
      const optionsData = await optionsRes.json().catch(() => ({}))
      if (!rulesRes.ok) throw new Error(rulesData.error ?? 'Failed to load rules')
      setRules(Array.isArray(rulesData.rules) ? rulesData.rules : [])
      setCountries(Array.isArray(optionsData.countries) ? optionsData.countries : [])
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

  const loadOperatorsForCountry = useCallback(
    async (countryIso3: string) => {
      setCascadeLoading(true)
      try {
        const data = await fetchCascade(`?country=${encodeURIComponent(countryIso3)}`)
        const operators = Array.isArray(data.operators) ? (data.operators as OperatorOption[]) : []
        setCascadeOperators(operators)
        cacheOperatorLabels(operators)
        return operators
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load operators')
        setCascadeOperators([])
        return []
      } finally {
        setCascadeLoading(false)
      }
    },
    [cacheOperatorLabels],
  )

  const loadProductTypesAndProviders = useCallback(
    async (countryIso3: string, operatorId: string, productType?: string) => {
      setCascadeLoading(true)
      try {
        const base = `?country=${encodeURIComponent(countryIso3)}&operatorId=${encodeURIComponent(operatorId)}`
        const path = productType && isConcrete(productType) ? `${base}&productType=${encodeURIComponent(productType)}` : base
        const data = await fetchCascade(path)
        if (!productType || !isConcrete(productType)) {
          setCascadeProductTypes(
            Array.isArray(data.productTypes) ? (data.productTypes as ProductTypeOption[]) : [],
          )
        }
        setCascadeProviders(Array.isArray(data.providers) ? (data.providers as CascadeProvider[]) : [])
        return data
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load catalog options')
        setCascadeProductTypes([])
        setCascadeProviders([])
        return null
      } finally {
        setCascadeLoading(false)
      }
    },
    [],
  )

  const hydrateCascade = useCallback(
    async (countryId: string, operatorId: string, productType: string) => {
      setCascadeOperators([])
      setCascadeProductTypes([])
      setCascadeProviders([])
      if (!isConcrete(countryId)) return

      const operators = await loadOperatorsForCountry(countryId)
      if (!isConcrete(operatorId)) return

      if (!operators.some((o) => o.id === operatorId)) return

      await loadProductTypesAndProviders(countryId, operatorId)
      if (isConcrete(productType)) {
        await loadProductTypesAndProviders(countryId, operatorId, productType)
      }
    },
    [loadOperatorsForCountry, loadProductTypesAndProviders],
  )

  const ruleNameOptions = useMemo((): SelectOption[] => {
    const base: SelectOption[] = ROUTING_RULE_NAME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
    if (form.ruleName && !base.some((o) => o.value === form.ruleName)) {
      base.unshift({ value: form.ruleName, label: form.ruleName })
    }
    return base
  }, [form.ruleName])

  const productTypeOptions = useMemo(() => {
    const items: SelectOption[] = [{ value: ROUTING_ANY, label: 'Any product type' }]
    for (const p of cascadeProductTypes) {
      if (!items.some((i) => i.value === p.value)) items.push(p)
    }
    if (isConcrete(form.productType) && !items.some((i) => i.value === form.productType)) {
      items.push({ value: form.productType, label: form.productType })
    }
    return items
  }, [cascadeProductTypes, form.productType])

  const countrySelected = isConcrete(form.countryId)
  const operatorSelected = isConcrete(form.operatorId)
  const productTypeSelected = isConcrete(form.productType)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rules.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
      if (!q) return true
      return (
        r.ruleName.toLowerCase().includes(q) ||
        (r.countryId ?? '').toLowerCase().includes(q) ||
        (r.operatorId ?? '').toLowerCase().includes(q) ||
        (r.providerCode ?? '').toLowerCase().includes(q)
      )
    })
  }, [rules, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedRules = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  function resetCascade() {
    setCascadeOperators([])
    setCascadeProductTypes([])
    setCascadeProviders([])
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    resetCascade()
    setDialogOpen(true)
  }

  function openEdit(rule: Rule) {
    setEditing(rule)
    const countryId = fromNullableRuleField(rule.countryId)
    const operatorId = fromNullableRuleField(rule.operatorId)
    const productType = fromNullableRuleField(rule.productType)
    setForm({
      ruleName: rule.ruleName,
      countryId,
      operatorId,
      productType,
      providerId: rule.providerId,
      priority: rule.priority,
    })
    resetCascade()
    setDialogOpen(true)
    void hydrateCascade(countryId, operatorId, productType)
  }

  async function onCountryChange(countryId: string) {
    setForm((f) => ({
      ...f,
      countryId,
      operatorId: ROUTING_ANY,
      productType: ROUTING_ANY,
      providerId: '',
    }))
    resetCascade()
    if (!isConcrete(countryId)) return
    await loadOperatorsForCountry(countryId)
  }

  async function onOperatorChange(operatorId: string) {
    setForm((f) => ({
      ...f,
      operatorId,
      productType: ROUTING_ANY,
      providerId: '',
    }))
    setCascadeProductTypes([])
    setCascadeProviders([])
    if (!isConcrete(form.countryId) || !isConcrete(operatorId)) return
    await loadProductTypesAndProviders(form.countryId, operatorId)
  }

  async function onProductTypeChange(productType: string) {
    setForm((f) => ({
      ...f,
      productType,
      providerId: '',
    }))
    setCascadeProviders([])
    if (!isConcrete(form.countryId) || !isConcrete(form.operatorId)) return
    if (!isConcrete(productType)) {
      await loadProductTypesAndProviders(form.countryId, form.operatorId)
      return
    }
    await loadProductTypesAndProviders(form.countryId, form.operatorId, productType)
  }

  async function saveRule() {
    if (!form.ruleName.trim() || !form.providerId) {
      toast.error('Rule name and provider are required')
      return
    }
    if (!isConcrete(form.countryId) || !isConcrete(form.operatorId) || !isConcrete(form.productType)) {
      toast.error('Select country, operator, and product type to choose a provider')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ruleName: form.ruleName.trim(),
        countryId: toNullableRuleField(form.countryId)?.toUpperCase() ?? null,
        operatorId: toNullableRuleField(form.operatorId) ?? null,
        productType: toNullableRuleField(form.productType)?.toLowerCase() ?? null,
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

  function productTypeLabel(value: string | null) {
    if (!value) return 'Any'
    const key = value.toLowerCase()
    return ROUTING_CATEGORY_LABELS[key] ?? key
  }

  return (
    <div className="space-y-6">
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
          <Button onClick={openCreate} disabled={!countries.length}>
            <Plus className="mr-2 size-4" />
            Add rule
          </Button>
        </div>
      </div>

      <RoutingSubnav />

      <Card>
        <CardHeader>
          <CardTitle>Active rules</CardTitle>
          <CardDescription>
            Select country → operator → product type → provider. Lower priority number wins first.
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

          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[15%]">Rule</TableHead>
                <TableHead className="w-[10%]">Country</TableHead>
                <TableHead className="w-[10%]">Operator</TableHead>
                <TableHead className="w-[10%]">Product</TableHead>
                <TableHead className="w-[10%]">Provider</TableHead>
                <TableHead className="w-[10%]">Priority</TableHead>
                <TableHead className="w-[8%]">Enabled</TableHead>
                <TableHead className="w-[8%] text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No routing rules found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.ruleName}</TableCell>
                    <TableCell>{displayWildcard(rule.countryId)}</TableCell>
                    <TableCell>{operatorLabel(rule.operatorId)}</TableCell>
                    <TableCell>{productTypeLabel(rule.productType)}</TableCell>
                    <TableCell>
                      {rule.providerName ?? rule.providerCode ?? rule.providerId.slice(0, 8)}
                    </TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell>
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
                    <TableCell>
                      <div className="flex justify-end gap-1 sm:gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(rule)} title="Edit">
                          <Pencil className="size-4 sm:mr-2" /> <span className="hidden sm:inline">Edit</span>
                        </Button>
                        {/* <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void deleteRule(rule.id)}
                          title="Delete"
                        >
                          <Trash2 className="size-4 sm:mr-2" /> <span className="hidden sm:inline">Delete</span>
                        </Button> */}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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
              Pick country, then operator, then product type. Providers listed have catalog coverage for that
              combination.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Rule name</Label>
              <Select value={form.ruleName} onValueChange={(v) => setForm((f) => ({ ...f, ruleName: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select rule type" />
                </SelectTrigger>
                <SelectContent>
                  {ruleNameOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={form.countryId} onValueChange={(v) => void onCountryChange(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.iso3} value={c.iso3}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operator</Label>
                <Select
                  value={form.operatorId}
                  disabled={!countrySelected || cascadeLoading}
                  onValueChange={(v) => void onOperatorChange(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={countrySelected ? 'Select operator' : 'Select country first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {cascadeOperators.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Product type</Label>
                <Select
                  value={form.productType}
                  disabled={!operatorSelected || cascadeLoading}
                  onValueChange={(v) => void onProductTypeChange(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={operatorSelected ? 'Select product type' : 'Select operator first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {productTypeOptions
                      .filter((opt) => opt.value !== ROUTING_ANY)
                      .map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 100 }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={form.providerId}
                disabled={!productTypeSelected || cascadeLoading || cascadeProviders.length === 0}
                onValueChange={(v) => setForm((f) => ({ ...f, providerId: v }))}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !productTypeSelected
                        ? 'Select product type first'
                        : cascadeProviders.length === 0
                          ? 'No providers for this combination'
                          : 'Select provider'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {cascadeProviders.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                  {form.providerId &&
                    !cascadeProviders.some((p) => p.id === form.providerId) && (
                      <SelectItem value={form.providerId}>Current selection</SelectItem>
                    )}
                </SelectContent>
              </Select>
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
    </div>
  )
}
