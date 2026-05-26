'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCcw } from 'lucide-react'
import { RoutingSubnav } from '@/app/admin/routing/_components/routing-subnav'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type LogRow = {
  id: string
  transactionId: string | null
  countryId: string | null
  operatorId: string | null
  productId: string | null
  providerCode?: string
  providerName?: string
  routingType: 'RULE' | 'LCR'
  providerCost: number | null
  fallbackUsed: boolean
  status: string
  createdAt: string
}

type Provider = { id: string; code: string; name: string }

const PAGE_SIZE = 50

export default function RoutingLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [countryId, setCountryId] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [providerId, setProviderId] = useState('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
      if (countryId.trim()) params.set('countryId', countryId.trim().toUpperCase())
      if (operatorId.trim()) params.set('operatorId', operatorId.trim())
      if (providerId !== 'ALL') params.set('providerId', providerId)
      if (from) params.set('from', new Date(from).toISOString())
      if (to) params.set('to', new Date(to).toISOString())

      const [logsRes, providersRes] = await Promise.all([
        fetch(`/api/admin/routing-logs?${params}`, { credentials: 'include', cache: 'no-store' }),
        providers.length
          ? Promise.resolve(null)
          : fetch('/api/admin/lcr/providers', { credentials: 'include', cache: 'no-store' }),
      ])

      const logsData = await logsRes.json().catch(() => ({}))
      if (!logsRes.ok) throw new Error(logsData.error ?? 'Failed to load logs')
      setLogs(Array.isArray(logsData.logs) ? logsData.logs : [])

      if (providersRes) {
        const providersData = await providersRes.json().catch(() => ({}))
        setProviders(
          Array.isArray(providersData.providers)
            ? providersData.providers.map((p: Provider) => ({ id: p.id, code: p.code, name: p.name }))
            : [],
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Load failed')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [countryId, operatorId, providerId, from, to, offset, providers.length])

  useEffect(() => {
    void load()
  }, [load])

  const hasMore = useMemo(() => logs.length === PAGE_SIZE, [logs.length])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Routing Logs</h1>
          <p className="text-muted-foreground">Audit trail of every routing decision.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <RoutingSubnav />

      <Card>
        <CardHeader>
          <CardTitle>Decision log</CardTitle>
          <CardDescription>Filter by country, operator, provider, or date range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input placeholder="Country ISO3" value={countryId} onChange={(e) => setCountryId(e.target.value)} />
            <Input placeholder="Operator ID" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} />
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All providers</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setOffset(0)
              void load()
            }}
          >
            Apply filters
          </Button>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No routing logs yet.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{log.transactionId ?? '—'}</TableCell>
                    <TableCell>{log.countryId ?? '—'}</TableCell>
                    <TableCell>{log.operatorId ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={log.routingType === 'RULE' ? 'default' : 'secondary'}>{log.routingType}</Badge>
                    </TableCell>
                    <TableCell>{log.providerName ?? log.providerCode ?? '—'}</TableCell>
                    <TableCell>{log.providerCost != null ? log.providerCost.toFixed(2) : '—'}</TableCell>
                    <TableCell>{log.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex justify-between">
            <Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
              Previous
            </Button>
            <Button variant="outline" disabled={!hasMore || loading} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
