'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type IntegrationDataPageProps = {
  title: string
  description: string
  endpoint: string
  collectionKey: string
  columns: Array<{ key: string; label: string; badge?: boolean }>
  actions?: ReactNode
}

function cellValue(row: any, key: string) {
  const value = key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), row)
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120)
  if (String(key).includes('_at') || String(key).toLowerCase().includes('at')) {
    const d = new Date(String(value))
    if (!Number.isNaN(d.getTime())) return d.toLocaleString()
  }
  return String(value)
}

export function IntegrationDataPage({ title, description, endpoint, collectionKey, columns, actions }: IntegrationDataPageProps) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useMemo(
    () => async () => {
      setLoading(true)
      try {
        const res = await fetch(endpoint, { credentials: 'include', cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        setRows(Array.isArray(data?.[collectionKey]) ? data[collectionKey] : [])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Load failed')
        setRows([])
      } finally {
        setLoading(false)
      }
    },
    [collectionKey, endpoint],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function triggerSync() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/aggregator/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'queue' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      toast.success('Sync queued')
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
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
          <Button onClick={() => void triggerSync()} disabled={refreshing}>
            {refreshing ? 'Queueing...' : 'Queue sync'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            <Link href="/admin/integrations" className="font-medium text-primary hover:underline">
              Back to integrations
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                    No records found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.id ?? index}>
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        {column.badge ? <StatusBadge value={cellValue(row, column.key)} /> : cellValue(row, column.key)}
                      </TableCell>
                    ))}
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

export function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? 'unknown')
  const active = ['ACTIVE', 'active', 'online', 'SUCCESS', 'true'].includes(label)
  return <Badge variant={active ? 'default' : 'secondary'}>{label}</Badge>
}
