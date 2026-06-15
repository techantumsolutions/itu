'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCcw, ChevronDown, ChevronRight } from 'lucide-react'
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
  metadata?: {
    routingStrategy: string
    ruleMatched: string
    ruleId: string | null
    ruleProvider: string | null
    totalAttempts: number
  }
}

const GRID_TEMPLATE_COLUMNS =
  'minmax(140px, 1.4fr) minmax(110px, 1.1fr) minmax(60px, 0.6fr) minmax(90px, 0.9fr) minmax(80px, 0.8fr) minmax(60px, 0.6fr) minmax(110px, 1.1fr) minmax(100px, 1fr) minmax(110px, 1.1fr) minmax(70px, 0.7fr) minmax(120px, 1.2fr) minmax(70px, 0.7fr) minmax(95px, 0.95fr)'


type Provider = { id: string; code: string; name: string }

const PAGE_SIZE = 10

export default function RoutingLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [totalLogs, setTotalLogs] = useState(0)
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [countryId, setCountryId] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [providerId, setProviderId] = useState('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, any>>({})
  const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>({})

  const toggleExpand = async (transactionId: string | null) => {
    if (!transactionId) return
    if (expandedRow === transactionId) {
      setExpandedRow(null)
      return
    }
    setExpandedRow(transactionId)
    if (!details[transactionId]) {
      setDetailsLoading((prev) => ({ ...prev, [transactionId]: true }))
      try {
        const res = await fetch(`/api/admin/routing-logs/detail?transactionId=${transactionId}`, { credentials: 'include' })
        const data = (await res.json().catch(() => ({}))) as { attempt?: unknown; error?: string }
        if (res.ok && data.attempt) {
          setDetails((prev) => ({ ...prev, [transactionId]: data.attempt }))
        } else {
          toast.error(data.error ?? 'Failed to load audit details')
        }
      } catch (err) {
        console.error(err)
      } finally {
        setDetailsLoading((prev) => ({ ...prev, [transactionId]: false }))
      }
    }
  }

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
      setTotalLogs(logsData.total || 0)

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

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE))
  const hasMore = offset + PAGE_SIZE < totalLogs

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
          <CardDescription>Click a row to expand routing audit details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:flex-nowrap">
            <Input placeholder="Country ISO3" value={countryId} onChange={(e) => setCountryId(e.target.value)} className="flex-1 min-w-[110px]" />
            <Input placeholder="Operator ID" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="flex-1 min-w-[110px]" />
            <div className="flex-1 min-w-[130px]">
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger className="w-full">
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
            </div>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 min-w-[130px]" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 min-w-[130px]" />
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                setOffset(0)
                void load()
              }}
            >
              Apply filters
            </Button>
          </div>

          <Table className="w-full overflow-x-auto">
            <TableHeader>
              <TableRow className="grid w-full gap-2 items-center px-4" style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}>
                <TableHead className="flex items-center">Time</TableHead>
                <TableHead className="flex items-center">Transaction</TableHead>
                <TableHead className="flex items-center">Country</TableHead>
                <TableHead className="flex items-center">Operator</TableHead>
                <TableHead className="flex items-center">Plan</TableHead>
                <TableHead className="flex items-center">Type</TableHead>
                <TableHead className="flex items-center">Strategy</TableHead>
                <TableHead className="flex items-center">Rule Matched</TableHead>
                <TableHead className="flex items-center">Rule Provider</TableHead>
                <TableHead className="flex items-center">Attempts</TableHead>
                <TableHead className="flex items-center">Provider</TableHead>
                <TableHead className="flex items-center">Cost</TableHead>
                <TableHead className="flex items-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                    No routing logs yet.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedRow === log.transactionId
                  const detail = log.transactionId ? details[log.transactionId] : null
                  const isDetailLoading = log.transactionId ? detailsLoading[log.transactionId] : false

                  const strategy = log.metadata?.routingStrategy ?? '—'
                  const ruleMatched = log.metadata?.ruleMatched ?? '—'
                  const ruleProvider = log.metadata?.ruleProvider ?? '—'
                  const totalAttempts = log.metadata?.totalAttempts ?? (log.fallbackUsed ? '> 1' : '1')

                  return (
                    <tr key={log.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td colSpan={13} className="p-0">
                        {/* Summary Header Row */}
                        <div 
                          className="flex items-center w-full cursor-pointer p-4 select-none hover:bg-muted/50" 
                          onClick={() => toggleExpand(log.transactionId)}
                        >
                          <div className="grid w-full items-center text-sm gap-2" style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}>
                            <div className="flex items-center gap-1">
                              {isExpanded ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                              <span>{new Date(log.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="font-mono text-xs truncate" title={log.transactionId ?? ''}>{log.transactionId ?? '—'}</div>
                            <div>{log.countryId ?? '—'}</div>
                            <div className="truncate" title={log.operatorId ?? ''}>{log.operatorId ?? '—'}</div>
                            <div className="font-mono text-xs truncate" title={log.productId ?? ''}>{log.productId ?? '—'}</div>
                            <div>
                              <Badge variant={log.routingType === 'RULE' ? 'default' : 'secondary'}>{log.routingType}</Badge>
                            </div>
                            <div className="font-semibold text-primary">{strategy}</div>
                            <div>
                              <Badge variant={ruleMatched === 'Yes' ? 'default' : 'outline'}>{ruleMatched}</Badge>
                            </div>
                            <div className="truncate" title={ruleProvider}>{ruleProvider}</div>
                            <div className="font-semibold">{totalAttempts}</div>
                            <div>{log.providerName ?? log.providerCode ?? '—'}</div>
                            <div>{log.providerCost != null ? log.providerCost.toFixed(2) : '—'}</div>
                            <div>
                              <Badge 
                                variant={
                                  log.status === 'success' || log.status === 'completed' 
                                    ? 'success' 
                                    : log.status === 'failed' 
                                      ? 'destructive' 
                                      : 'outline'
                                }
                              >
                                {log.status}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Expanded details container */}
                        {isExpanded && (
                          <div className="bg-muted/20 border-t p-6 space-y-6">
                            {isDetailLoading ? (
                              <div className="py-4 text-center text-sm text-muted-foreground">Loading audit details...</div>
                            ) : !detail ? (
                              <div className="py-4 text-center text-sm text-muted-foreground">No detailed attempts logged for this transaction.</div>
                            ) : (
                              <div className="space-y-6">
                                {/* Header Summary */}
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-5 bg-card p-4 rounded-lg border text-sm shadow-sm">
                                  <div>
                                    <div className="text-muted-foreground text-xs">Routing Strategy</div>
                                    <div className="font-semibold text-primary">{detail.routing_decision?.routing_strategy ?? detail.routing_decision?.routingStrategy ?? '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-xs">Rule Matched</div>
                                    <div className="font-semibold">{(detail.routing_decision?.routing_rule_matched ?? detail.routing_decision?.ruleMatched) ? 'Yes' : 'No'}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-xs">Rule Provider</div>
                                    <div className="font-semibold">{detail.routing_decision?.routing_rule_provider ?? detail.routing_decision?.ruleProvider ?? '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-xs">Total Attempts</div>
                                    <div className="font-semibold">{detail.attempts?.length ?? 0}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-xs">Final Outcome</div>
                                    <div className="font-semibold">
                                      <Badge variant={detail.status === 'success' ? 'success' : 'destructive'}>
                                        {detail.status === 'success' ? 'Success' : 'Failed'}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>

                                {/* Split Details View */}
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                                  
                                  {/* Column 1: Provider Mapping Integrity Check Metrics */}
                                  <div className="bg-card rounded-lg border p-4 shadow-sm space-y-3">
                                    <h4 className="text-sm font-semibold border-b pb-2 text-primary">Provider Mapping Integrity Check</h4>
                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                      <div className="col-span-2">
                                        <div className="text-muted-foreground">Internal Plan ID</div>
                                        <div className="font-semibold font-mono break-all">{detail.internal_plan_id ?? '—'}</div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">Mapping Count</div>
                                        <div className="font-semibold text-sm">{detail.routing_decision?.mapping_count ?? '0'}</div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">Candidate Provider Count</div>
                                        <div className="font-semibold text-sm">{detail.routing_decision?.candidate_provider_count ?? '0'}</div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">Eligible Provider Count</div>
                                        <div className="font-semibold text-sm">{detail.routing_decision?.eligible_provider_count ?? '0'}</div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">Selected Provider</div>
                                        <div className="font-semibold text-sm text-primary">{detail.routing_decision?.selected_provider ?? '—'}</div>
                                      </div>
                                      <div className="col-span-2">
                                        <div className="text-muted-foreground">Routing Decision Reason</div>
                                        <div className="font-semibold text-sm mt-1">
                                          <Badge variant="outline">{detail.routing_decision?.routing_decision_reason ?? '—'}</Badge>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Column 2: Candidate Snapshots */}
                                  <div className="bg-card rounded-lg border p-4 shadow-sm space-y-3">
                                    <h4 className="text-sm font-semibold border-b pb-2 text-primary">Evaluated Providers Snapshot</h4>
                                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                                      {(() => {
                                        const evaluatedList = detail.routing_decision?.evaluated_providers ?? detail.routing_decision?.evaluatedProviders ?? []
                                        return Array.isArray(evaluatedList) && evaluatedList.length > 0 ? (
                                          evaluatedList.map((ev: any, idx: number) => {
                                            const providerName = ev.providerName || ev.providerId || ev.provider || '—'
                                            const isEligible = ev.eligibility ?? ev.eligible ?? false
                                            const cost = ev.costPrice ?? ev.cost
                                            const margin = ev.margin
                                            const priority = ev.priority
                                            const reason = ev.filterReason ?? ev.reason
                                            const isSelected = ev.providerId === detail.routing_decision?.selected_provider || ev.provider === detail.routing_decision?.selected_provider || providerName === detail.routing_decision?.selected_provider

                                            return (
                                              <div 
                                                key={idx} 
                                                className={`flex flex-col p-3 rounded border text-xs gap-1 ${
                                                  isSelected 
                                                    ? 'border-primary bg-primary/5 shadow-sm' 
                                                    : isEligible 
                                                      ? 'bg-muted/20' 
                                                      : 'bg-muted/10 opacity-60'
                                                }`}
                                              >
                                                <div className="flex justify-between items-center">
                                                  <span className="font-semibold text-sm">{providerName}</span>
                                                  <div className="flex gap-2">
                                                    {priority != null && <Badge variant="outline" className="text-[10px]">Priority {priority}</Badge>}
                                                    <Badge variant={isEligible ? 'success' : 'destructive'} className="text-[10px]">
                                                      {isEligible ? 'Eligible' : 'Filtered'}
                                                    </Badge>
                                                  </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-1 text-muted-foreground">
                                                  <div>Cost: <span className="font-medium text-foreground">{cost != null && cost !== Infinity ? cost.toFixed(2) : 'N/A'}</span></div>
                                                  <div>Margin: <span className="font-medium text-foreground">{margin != null ? `${margin}%` : 'N/A'}</span></div>
                                                </div>
                                                {!isEligible && reason && (
                                                  <div className="text-destructive mt-1 font-medium bg-destructive/5 px-1.5 py-0.5 rounded border border-destructive/10">Reason: {reason}</div>
                                                )}
                                              </div>
                                            )
                                          })
                                        ) : (
                                          <div className="text-center text-xs text-muted-foreground py-4">No candidates evaluated.</div>
                                        )
                                      })()}
                                    </div>
                                  </div>

                                  {/* Column 3: Execution Hop Timeline */}
                                  <div className="bg-card rounded-lg border p-4 shadow-sm space-y-3">
                                    <h4 className="text-sm font-semibold border-b pb-2 text-primary">Attempt Timeline</h4>
                                    <div className="relative pl-6 space-y-4 border-l border-muted max-h-[350px] overflow-y-auto pr-1">
                                      {Array.isArray(detail.attempts) && detail.attempts.length > 0 ? (
                                        detail.attempts.map((hop: any, idx: number) => (
                                          <div key={idx} className="relative">
                                            {/* Timeline bullet */}
                                            <span className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold ${
                                              hop.ok 
                                                ? 'bg-emerald-500 border-emerald-600 text-white shadow shadow-emerald-500/20' 
                                                : 'bg-rose-500 border-rose-600 text-white shadow shadow-rose-500/20'
                                            }`}>
                                              {idx + 1}
                                            </span>
                                            <div className="space-y-1">
                                              <div className="flex items-center justify-between">
                                                <span className="font-semibold text-xs text-foreground">
                                                  Attempt #{idx + 1}: {hop.providerName}
                                                </span>
                                                <Badge variant={hop.ok ? 'success' : 'destructive'} className="text-[10px]">
                                                  {hop.ok ? 'Success' : 'Failed'}
                                                </Badge>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                                                <div>Source: <span className="font-medium text-foreground">{hop.source}</span></div>
                                                <div>Cost: <span className="font-medium text-foreground">{hop.cost != null ? hop.cost.toFixed(2) : '—'}</span></div>
                                              </div>
                                              {!hop.ok && (
                                                <div className="text-[10px] text-destructive bg-rose-50/50 p-2 rounded border border-rose-100 mt-1 font-mono">
                                                  {hop.error || 'Unknown Error'}
                                                  {hop.errorCode && <span className="block font-semibold">Error Code: {hop.errorCode}</span>}
                                                  {hop.errorMessage && <span className="block">Message: {hop.errorMessage}</span>}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="text-center text-xs text-muted-foreground py-4">No attempts recorded yet.</div>
                                      )}
                                    </div>
                                  </div>

                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button variant="outline" disabled={!hasMore || loading} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
