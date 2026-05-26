'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function CronStatusPage() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    void fetch('/api/admin/aggregator/cron-status', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null))
  }, [])

  const queues = data?.queues
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cron Status</h1>
        <p className="text-muted-foreground">Daily provider sync and BullMQ queue health.</p>
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
