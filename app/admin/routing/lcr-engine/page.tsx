'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCcw, Save } from 'lucide-react'
import { RoutingSubnav } from '@/app/admin/routing/_components/routing-subnav'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

type Settings = {
  enabled: boolean
  routingStrategy: string
  fallbackStrategy: string
  autoFailover: boolean
  retryEnabled: boolean
  retryAttempts: number
}

type PriorityRow = {
  providerId: string
  providerCode?: string
  providerName?: string
  priority: number
}

export default function LcrEnginePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(true)
  const [settings, setSettings] = useState<Settings>({
    enabled: true,
    routingStrategy: 'LEAST_COST',
    fallbackStrategy: 'NEXT_PROVIDER',
    autoFailover: true,
    retryEnabled: true,
    retryAttempts: 2,
  })
  const [priorities, setPriorities] = useState<PriorityRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, prioritiesRes] = await Promise.all([
        fetch('/api/admin/lcr/settings', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/provider-priorities', { credentials: 'include', cache: 'no-store' }),
      ])
      const settingsData = await settingsRes.json().catch(() => ({}))
      const prioritiesData = await prioritiesRes.json().catch(() => ({}))
      if (!settingsRes.ok) throw new Error(settingsData.error ?? 'Failed to load settings')
      setSchemaReady(settingsData.schemaReady !== false)
      if (settingsData.settings) setSettings(settingsData.settings)
      setPriorities(Array.isArray(prioritiesData.priorities) ? prioritiesData.priorities : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/lcr/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      toast.success('LCR settings saved')
      setSchemaReady(data.schemaReady !== false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function savePriorities() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/provider-priorities', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorities }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setPriorities(Array.isArray(data.priorities) ? data.priorities : priorities)
      toast.success('Provider priorities saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function updatePriority(providerId: string, priority: number) {
    setPriorities((prev) =>
      prev.map((p) => (p.providerId === providerId ? { ...p, priority } : p)).sort((a, b) => a.priority - b.priority),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Routing</h1>
          <p className="text-muted-foreground">Configure LCR behavior, provider ranking, and failover.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <RoutingSubnav />

      {!schemaReady ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Run <code className="font-mono">supabase/routing_engine_schema.sql</code> in Supabase to persist settings,
          rules, and logs.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>LCR Engine</CardTitle>
          <CardDescription>Global routing strategy applied when no routing rule matches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="enabled">Engine enabled</Label>
                <p className="text-xs text-muted-foreground">When off, only routing rules apply.</p>
              </div>
              <Switch
                id="enabled"
                checked={settings.enabled}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="autoFailover">Auto failover</Label>
                <p className="text-xs text-muted-foreground">Try next provider on failure.</p>
              </div>
              <Switch
                id="autoFailover"
                checked={settings.autoFailover}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, autoFailover: v }))}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Routing strategy</Label>
              <Select
                value={settings.routingStrategy}
                onValueChange={(v) => setSettings((s) => ({ ...s, routingStrategy: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LEAST_COST">Least cost</SelectItem>
                  <SelectItem value="PRIORITY">Priority</SelectItem>
                  <SelectItem value="HIGHEST_MARGIN">Highest margin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fallback strategy</Label>
              <Select
                value={settings.fallbackStrategy}
                onValueChange={(v) => setSettings((s) => ({ ...s, fallbackStrategy: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEXT_PROVIDER">Next provider (by strategy)</SelectItem>
                  <SelectItem value="PRIORITY_PROVIDER">Priority provider</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="retryEnabled">Retry enabled</Label>
                <p className="text-xs text-muted-foreground">Retry with fallback providers.</p>
              </div>
              <Switch
                id="retryEnabled"
                checked={settings.retryEnabled}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, retryEnabled: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retryAttempts">Retry attempts</Label>
              <Input
                id="retryAttempts"
                type="number"
                min={0}
                max={10}
                value={settings.retryAttempts}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, retryAttempts: Math.min(10, Math.max(0, Number(e.target.value) || 0)) }))
                }
              />
            </div>
          </div>

          <Button onClick={() => void saveSettings()} disabled={saving || loading}>
            <Save className="mr-2 size-4" />
            Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider priorities</CardTitle>
          <CardDescription>
            Used when routing strategy is <Badge variant="secondary">PRIORITY</Badge>. Lower number = higher rank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : priorities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No active providers found.
                  </TableCell>
                </TableRow>
              ) : (
                priorities.map((row, index) => (
                  <TableRow key={row.providerId}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.providerName ?? row.providerCode}</div>
                      <div className="text-xs text-muted-foreground">{row.providerCode}</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-24"
                        value={row.priority}
                        onChange={(e) => updatePriority(row.providerId, Number(e.target.value) || 100)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <Button variant="outline" onClick={() => void savePriorities()} disabled={saving || loading || !priorities.length}>
            Save priorities
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
