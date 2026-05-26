'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCcw, Pencil, Trash2 } from 'lucide-react'
import { RoutingSubnav } from '@/app/admin/routing/_components/routing-subnav'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

type Provider = { id: string; code: string; name: string }

const emptyForm = {
  ruleName: '',
  countryId: '',
  operatorId: '',
  productType: '',
  providerId: '',
  priority: 100,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  effectiveFrom: '',
  effectiveTo: '',
}

export default function RoutingRulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rulesRes, providersRes] = await Promise.all([
        fetch('/api/admin/routing-rules', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/lcr/providers', { credentials: 'include', cache: 'no-store' }),
      ])
      const rulesData = await rulesRes.json().catch(() => ({}))
      const providersData = await providersRes.json().catch(() => ({}))
      if (!rulesRes.ok) throw new Error(rulesData.error ?? 'Failed to load rules')
      setRules(Array.isArray(rulesData.rules) ? rulesData.rules : [])
      setProviders(
        Array.isArray(providersData.providers)
          ? providersData.providers.map((p: Provider) => ({ id: p.id, code: p.code, name: p.name }))
          : [],
      )
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

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(rule: Rule) {
    setEditing(rule)
    setForm({
      ruleName: rule.ruleName,
      countryId: rule.countryId ?? '',
      operatorId: rule.operatorId ?? '',
      productType: rule.productType ?? '',
      providerId: rule.providerId,
      priority: rule.priority,
      status: rule.status,
      effectiveFrom: rule.effectiveFrom ? rule.effectiveFrom.slice(0, 16) : '',
      effectiveTo: rule.effectiveTo ? rule.effectiveTo.slice(0, 16) : '',
    })
    setDialogOpen(true)
  }

  async function saveRule() {
    if (!form.ruleName.trim() || !form.providerId) {
      toast.error('Rule name and provider are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ruleName: form.ruleName.trim(),
        countryId: form.countryId.trim().toUpperCase() || null,
        operatorId: form.operatorId.trim() || null,
        productType: form.productType.trim() || null,
        providerId: form.providerId,
        priority: form.priority,
        status: form.status,
        effectiveFrom: form.effectiveFrom ? new Date(form.effectiveFrom).toISOString() : null,
        effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : null,
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
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Add rule
          </Button>
        </div>
      </div>

      <RoutingSubnav />

      <Card>
        <CardHeader>
          <CardTitle>Active rules</CardTitle>
          <CardDescription>First matching rule by priority wins. Leave fields blank for wildcard.</CardDescription>
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
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
                filtered.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.ruleName}</TableCell>
                    <TableCell>{rule.countryId ?? 'Any'}</TableCell>
                    <TableCell>{rule.operatorId ?? 'Any'}</TableCell>
                    <TableCell>{rule.productType ?? 'Any'}</TableCell>
                    <TableCell>{rule.providerName ?? rule.providerCode ?? rule.providerId.slice(0, 8)}</TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell>
                      <Badge variant={rule.status === 'ACTIVE' ? 'default' : 'secondary'}>{rule.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => void deleteRule(rule.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit routing rule' : 'Create routing rule'}</DialogTitle>
            <DialogDescription>Matching transactions use the assigned provider and skip LCR.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Rule name</Label>
              <Input value={form.ruleName} onChange={(e) => setForm((f) => ({ ...f, ruleName: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Country (ISO3)</Label>
                <Input
                  placeholder="IND"
                  value={form.countryId}
                  onChange={(e) => setForm((f) => ({ ...f, countryId: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Operator ID</Label>
                <Input
                  placeholder="airtel"
                  value={form.operatorId}
                  onChange={(e) => setForm((f) => ({ ...f, operatorId: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Product type</Label>
                <Input
                  placeholder="topup"
                  value={form.productType}
                  onChange={(e) => setForm((f) => ({ ...f, productType: e.target.value }))}
                />
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
              <Select value={form.providerId} onValueChange={(v) => setForm((f) => ({ ...f, providerId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'ACTIVE' | 'INACTIVE' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveRule()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
