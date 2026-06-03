'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, RefreshCcw, Zap, AlertTriangle, CheckCircle2, XCircle, Activity, Settings2 } from 'lucide-react'
import { CompactDateTime } from '@/app/admin/integrations/_components/integration-data-page'
import { useAuthStore } from '@/lib/stores'
import { toast } from 'sonner'
import type { User } from '@/lib/types'
import { isClientAdminUser, isClientSuperAdmin } from '@/lib/tickets/auth-headers'
import { clientHasAdminFeature } from '@/lib/auth/client-features'

type LcrProviderRow = {
  id: string
  code: string
  name: string
  adapter_key: string
  is_active: boolean
  priority: number
  base_url: string | null
  refresh_interval_minutes: number
  status: string
  supported_countries: string[]
  success_rate: number | null
  avg_latency_ms: number | null
  last_health_check: string | null
  last_plan_ingest_at: string | null
}

type CoverageRow = { countryIso3: string; operatorRef: string; providerCodes: string[] }

const ACTIONS_HEAD =
  'sticky right-0 z-20 w-[148px] min-w-[148px] max-w-[148px] shrink-0 border-l border-border/60 bg-muted/95 backdrop-blur-sm shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.15)] whitespace-nowrap normal-case tracking-normal'
const ACTIONS_CELL =
  'sticky right-0 z-10 w-[148px] min-w-[148px] max-w-[148px] shrink-0 border-l border-border/60 bg-background group-hover:bg-muted/60 shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.15)]'

function adminHeaders(user: User) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': user.id,
    'x-user-email': user.email,
    'x-user-name': user.name ?? 'Admin',
    'x-user-role': user.role,
  }
}

function statusBadge(status: string) {
  const s = (status || 'unknown').toLowerCase()
  if (s === 'online')
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Online
      </Badge>
    )
  if (s === 'degraded')
    return (
      <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Degraded
      </Badge>
    )
  if (s === 'offline')
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
        <XCircle className="h-3 w-3 mr-1" />
        Offline
      </Badge>
    )
  return <Badge variant="outline">Unknown</Badge>
}

export default function AdminProvidersPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [providers, setProviders] = useState<LcrProviderRow[]>([])
  const [coverageRows, setCoverageRows] = useState<CoverageRow[]>([])
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editingProvider, setEditingProvider] = useState<LcrProviderRow | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      // Priority 0 = unset, always sink to bottom
      if (a.priority === 0 && b.priority === 0) return 0
      if (a.priority === 0) return 1
      if (b.priority === 0) return -1
      return a.priority - b.priority
    })
  }, [providers])

  const priorityOptions = useMemo(() => {
    // Priority slots available for the current provider in the dialog
    const takenByOthers = new Set(
      providers.filter((p) => p.id !== editingProvider?.id && p.priority > 0).map((p) => p.priority)
    )
    const activeSlots = providers.filter((p) => p.id !== editingProvider?.id && p.priority > 0).length
    const total = activeSlots + 1
    const numbered = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !takenByOthers.has(n))
    return [0, ...numbered]
  }, [providers, editingProvider])

  const loadAll = useCallback(async () => {
    if (!user || !isClientAdminUser(user)) return
    const h = adminHeaders(user)
    setLoading(true)
    try {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/admin/lcr/providers', { credentials: 'include', headers: h, cache: 'no-store' }),
        fetch('/api/admin/lcr/coverage', { credentials: 'include', headers: h, cache: 'no-store' }),
      ])
      const pJson = await pRes.json().catch(() => ({}))
      const cJson = await cRes.json().catch(() => ({}))
      if (!pRes.ok) throw new Error(pJson.error ?? 'Failed to load providers')
      setProviders(Array.isArray(pJson.providers) ? pJson.providers : [])
      setConfigured(pJson.configured !== false)
      setCoverageRows(Array.isArray(cJson.rows) ? cJson.rows : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
      setProviders([])
      setCoverageRows([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user && !isClientAdminUser(user)) {
      toast.error('Admins only')
      router.replace('/account')
    }
  }, [user, router])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    if (!isClientAdminUser(user)) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/admin/lcr/bootstrap-env', {
          method: 'POST',
          credentials: 'include',
          headers: adminHeaders(user),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && Array.isArray(data.created) && data.created.length) {
          toast.message(`Registered from environment: ${data.created.join(', ')}`)
        }
        if (res.ok && Array.isArray(data.errors) && data.errors.length) {
          toast.error(
            `Bootstrap: ${data.errors.map((e: { code: string; detail: string }) => `${e.code} — ${e.detail.slice(0, 160)}`).join(' · ')}`,
          )
        }
      } catch {
        /* env may be empty */
      }
      if (!cancelled) await loadAll()
    })()
    return () => {
      cancelled = true
    }
  }, [user, loadAll])

  const stats = {
    totalProviders: providers.length,
    activeProviders: providers.filter((p) => p.is_active).length,
    onlineProviders: providers.filter((p) => p.is_active && (p.status || '').toLowerCase() === 'online').length,
    avgSuccessRate:
      providers.filter((p) => p.is_active && p.success_rate != null).length === 0
        ? 0
        : Math.round(
          (providers
            .filter((p) => p.is_active && p.success_rate != null)
            .reduce((s, p) => s + Number(p.success_rate), 0) /
            providers.filter((p) => p.is_active && p.success_rate != null).length) *
          10,
        ) / 10,
  }

  const handleSyncAll = async () => {
    if (!user || !isClientAdminUser(user)) return
    if (!configured) {
      toast.error('Supabase is not configured')
      return
    }
    setIsRefreshing(true)
    const h = adminHeaders(user)
    const results: { code: string; ok: boolean; msg: string }[] = []

    for (const p of providers.filter((x) => x.is_active)) {
      try {
        const res = await fetch('/api/admin/lcr/sync', {
          method: 'POST',
          credentials: 'include',
          headers: h,
          body: JSON.stringify({ providerId: p.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Sync failed')
        const r = data.result
        results.push({
          code: p.code,
          ok: true,
          msg: r
            ? `raw ${r.fetchedRaw ?? 0}, mapped ${r.mappedPlans ?? 0}${r.syncedCountries?.length ? ` (${r.syncedCountries.join(', ')})` : ''}`
            : 'ok',
        })
      } catch (e) {
        results.push({
          code: p.code,
          ok: false,
          msg: e instanceof Error ? e.message : 'error',
        })
      }
    }
    setIsRefreshing(false)
    const failed = results.filter((r) => !r.ok)
    if (failed.length) toast.error(`Some syncs failed: ${failed.map((f) => f.code).join(', ')}`)
    else toast.success('Catalog sync finished')
    await loadAll()
  }

  const handleSyncProvider = async (providerId: string) => {
    if (!user || !isClientAdminUser(user)) return
    if (!configured) {
      toast.error('Supabase is not configured')
      return
    }
    setSyncingId(providerId)
    const h = adminHeaders(user)
    try {
      const res = await fetch('/api/admin/lcr/sync', {
        method: 'POST',
        credentials: 'include',
        headers: h,
        body: JSON.stringify({ providerId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      const r = data.result
      toast.success(
        r
          ? `Sync finished — raw ${r.fetchedRaw ?? 0}, mapped ${r.mappedPlans ?? 0}`
          : 'Catalog sync finished',
      )
      await loadAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  const handleToggleProvider = async (providerId: string, isActive: boolean) => {
    if (!user || !isClientAdminUser(user)) return
    const h = adminHeaders(user)
    try {
      const res = await fetch(`/api/admin/lcr/providers/${encodeURIComponent(providerId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: h,
        body: JSON.stringify({ isActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      await loadAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const saveEdit = async () => {
    if (!user || !editingProvider) return
    const h = adminHeaders(user)
    try {
      const res = await fetch(`/api/admin/lcr/providers/${encodeURIComponent(editingProvider.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: h,
        body: JSON.stringify({
          name: editingProvider.name,
          adapterKey: editingProvider.adapter_key,
          baseUrl: editingProvider.base_url || undefined,
          priority: editingProvider.priority,
          refreshIntervalMinutes: editingProvider.refresh_interval_minutes,
          supportedCountries: editingProvider.supported_countries,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      toast.success('Provider updated')
      setEditingProvider(null)
      await loadAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Providers</h1>
          <p className="text-muted-foreground">
            Live registry from Supabase (LCR). Admins can add providers on a dedicated page; DT One / Ding can be
            registered from environment on load when credentials are set.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadAll()} disabled={loading} className="gap-2">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Reload
          </Button>
          <Button variant="outline" onClick={handleSyncAll} disabled={isRefreshing || !configured} className="gap-2">
            <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sync catalog
          </Button>
          {user &&
            isClientAdminUser(user) &&
            (isClientSuperAdmin(user) || clientHasAdminFeature(user, 'providers_manage')) && (
              <Button className="gap-2" asChild>
                <Link href="/admin/providers/new">
                  <Plus className="h-4 w-4" />
                  Add provider
                </Link>
              </Button>
            )}
        </div>
      </div>

      {!configured && (
        <p className="text-sm text-amber-800 ">
          Supabase catalog env vars are missing — configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to load
          providers.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Total Providers
            </CardDescription>
            <CardTitle className="text-2xl">{stats.totalProviders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Active Providers
            </CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats.activeProviders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Online (status)
            </CardDescription>
            <CardTitle className="text-2xl text-blue-600">{stats.onlineProviders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Avg success rate (metrics)
            </CardDescription>
            <CardTitle className="text-2xl">{stats.avgSuccessRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Providers</CardTitle>
          <CardDescription>Rows in lcr_providers — source for routing and ingestion.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative min-w-0 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className={ACTIONS_HEAD}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : sortedProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No providers yet. Use Add provider, or set DTONE_API_KEY + DTONE_API_SECRET in env (bootstrap runs on load). Ensure Supabase is configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedProviders.map((provider) => (
                    <TableRow key={provider.id} className="group">
                      <TableCell>
                        <div className="min-w-0 leading-tight">
                          <p className="truncate font-medium">{provider.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground font-mono">{provider.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="leading-tight">
                          <Badge variant="secondary" className="text-xs">
                            {provider.adapter_key}
                          </Badge>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">P{provider.priority}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          {statusBadge(provider.status)}
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={provider.is_active}
                              onCheckedChange={(v) => void handleToggleProvider(provider.id, v)}
                              className="scale-90"
                            />
                            <span className="text-[11px] text-muted-foreground">
                              {provider.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {provider.last_plan_ingest_at ? (
                          <CompactDateTime value={provider.last_plan_ingest_at} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell className={ACTIONS_CELL}>
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full"
                            disabled={!provider.is_active || syncingId === provider.id || isRefreshing}
                            onClick={() => void handleSyncProvider(provider.id)}
                          >
                            {syncingId === provider.id ? 'Syncing…' : 'Sync'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-full"
                            onClick={() => setEditingProvider({ ...provider })}
                          >
                            <Settings2 className="mr-1 size-3.5" />
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {/* 
      <Card>
        <CardHeader>
          <CardTitle>Coverage matrix</CardTitle>
          <CardDescription>
            Country (ISO3) and operator ref from internal plans with active mappings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="min-w-0 overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country (ISO3)</TableHead>
                  <TableHead>Operator ref</TableHead>
                  <TableHead>Provider codes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      No mapped internal plans yet. Run catalog sync on an active provider.
                    </TableCell>
                  </TableRow>
                ) : (
                  coverageRows.slice(0, 200).map((row) => (
                    <TableRow key={`${row.countryIso3}-${row.operatorRef}`}>
                      <TableCell>{row.countryIso3}</TableCell>
                      <TableCell className="font-mono text-xs">{row.operatorRef}</TableCell>
                      <TableCell>
                        {row.providerCodes.length === 0 ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700">
                            No mappings
                          </Badge>
                        ) : (
                          row.providerCodes.map((code) => (
                            <Badge key={code} variant="outline" className="mr-1 mb-1">
                              {code}
                            </Badge>
                          ))
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {coverageRows.length > 200 && (
              <p className="text-xs text-muted-foreground p-2">Showing first 200 of {coverageRows.length} rows.</p>
            )}
          </div>
        </CardContent>
      </Card> */}

      <Dialog open={!!editingProvider} onOpenChange={(o) => !o && setEditingProvider(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Configure {editingProvider?.name}</DialogTitle>
            <DialogDescription>Updates the provider registry (credentials are not shown; re-enter to replace).</DialogDescription>
          </DialogHeader>
          {editingProvider && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Provider code</Label>
                  <Input value={editingProvider.code} readOnly className="bg-muted" />
                </div>
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input value={editingProvider.name} onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Adapter</Label>
                <Input
                  value={editingProvider.adapter_key}
                  onChange={(e) => setEditingProvider({ ...editingProvider, adapter_key: e.target.value.trim().toLowerCase() })}
                  placeholder="dtone, valuetopup, ding, reloadly"
                />
              </div>
              <div className="grid gap-2">
                <Label>API base URL</Label>
                <Input
                  value={editingProvider.base_url ?? ''}
                  onChange={(e) => setEditingProvider({ ...editingProvider, base_url: e.target.value || null })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label>Priority</Label>
                  <Select
                    value={String(editingProvider.priority)}
                    onValueChange={(v) => setEditingProvider({ ...editingProvider, priority: Number(v) || 0 })}
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
                <div className="grid gap-2">
                  <Label>Refresh interval (min)</Label>
                  <Input
                    type="number"
                    value={editingProvider.refresh_interval_minutes}
                    onChange={(e) =>
                      setEditingProvider({
                        ...editingProvider,
                        refresh_interval_minutes: Number(e.target.value) || 60,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Supported countries</Label>
                <Input
                  value={(editingProvider.supported_countries ?? []).join(', ')}
                  placeholder="IND, USA"
                  onChange={(e) =>
                    setEditingProvider({
                      ...editingProvider,
                      supported_countries: e.target.value
                        .split(/[\s,]+/)
                        .map((s) => s.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProvider(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
