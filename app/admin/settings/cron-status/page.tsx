'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { RefreshCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function CronStatusPage() {
  const [data, setData] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)

  const load = () => {
    void fetch('/api/admin/aggregator/cron-status', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null))
  }

  useEffect(() => {
    load()
  }, [])

  async function runSyncNow() {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/aggregator/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'inline' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Sync failed')
      toast.success('Catalog sync finished')
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const queues = data?.queues
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cron Status</h1>
          <Link href="/admin/settings?tab=system" className="text-sm font-medium text-primary hover:underline">
            Back to settings
          </Link>
          <p className="mt-1 text-muted-foreground">Daily provider sync and BullMQ queue health.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
          <Button onClick={() => void runSyncNow()} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Run sync now'}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/integrations/sync-logs">View sync logs</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Scheduler</CardTitle>
            <CardDescription>{data?.cron?.endpoint ?? '/api/cron/lcr-v2-sync'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge>{data?.cron?.schedule ?? 'daily'}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Redis</CardTitle>
            <CardDescription>Queue backend</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={queues?.redisConfigured ? 'default' : 'secondary'}>
              {queues?.redisConfigured ? 'Configured' : 'Not configured'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Provider Sync</CardTitle>
            <CardDescription>waiting / active / failed</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {queues?.providerSync ? JSON.stringify(queues.providerSync) : 'Inline fallback mode'}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
