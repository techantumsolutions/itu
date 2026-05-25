'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function AdminAnalyticsPage() {
  const [sales, setSales] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => {
    void fetch('/api/admin/dashboard', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setSales(Array.isArray(data?.sales) ? data.sales : []))
      .catch(() => setSales([]))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Database-backed daily sales analytics.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daily Sales</CardTitle>
          <CardDescription>Empty until real transactions exist.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No analytics data yet.
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((row) => (
                  <TableRow key={`${row.day}-${row.currency}`}>
                    <TableCell>{String(row.day ?? '—')}</TableCell>
                    <TableCell>{String(row.currency ?? '—')}</TableCell>
                    <TableCell>{Number(row.revenue) || 0}</TableCell>
                    <TableCell>{Number(row.orders) || 0}</TableCell>
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
