'use client'

import { useEffect, useState } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AdminStatisticsPage() {
  const [summary, setSummary] = useState<Record<string, unknown>>({})

  useEffect(() => {
    void fetch('/api/admin/dashboard', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setSummary(data?.summary ?? {}))
      .catch(() => setSummary({}))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Statistics</h1>
        <p className="text-muted-foreground">Live statistics from database reporting views.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Revenue', summary.total_revenue],
          ['Orders', summary.total_orders],
          ['Completed', summary.completed_orders],
          ['Failed', summary.failed_orders],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader>
              <CardDescription>{String(label)}</CardDescription>
              <CardTitle>{String(Number(value) || 0)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  )
}
