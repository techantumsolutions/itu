'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart3 } from 'lucide-react'

type DashboardData = {
  summary?: Record<string, unknown>
  sales?: Array<Record<string, unknown>>
  topProducts?: Array<Record<string, unknown>>
}

export default function AdminReportsPage() {
  const [data, setData] = useState<DashboardData>({})

  useEffect(() => {
    void fetch('/api/admin/dashboard', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({}))
  }, [])

  const summary = data.summary ?? {}
  const sales = Array.isArray(data.sales) ? data.sales : []
  const topProducts = Array.isArray(data.topProducts) ? data.topProducts : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Database-backed sales, transaction, and product reporting.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Revenue', summary.total_revenue],
          ['Orders', summary.total_orders],
          ['Completed', summary.completed_orders],
          ['Failed', summary.failed_orders],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2">
              <CardDescription>{String(label)}</CardDescription>
              <CardTitle>{String(Number(value) || 0)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" />
            Daily Sales
          </CardTitle>
          <CardDescription>From `admin_daily_sales` view.</CardDescription>
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
                    No sales data yet.
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

      <Card>
        <CardHeader>
          <CardTitle>Top Products</CardTitle>
          <CardDescription>From `admin_top_products` view.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No product sales yet.
                  </TableCell>
                </TableRow>
              ) : (
                topProducts.map((row) => (
                  <TableRow key={`${row.product_name}-${row.operator_name}`}>
                    <TableCell>{String(row.product_name ?? '—')}</TableCell>
                    <TableCell>{String(row.operator_name ?? '—')}</TableCell>
                    <TableCell>{Number(row.orders) || 0}</TableCell>
                    <TableCell>{Number(row.revenue) || 0}</TableCell>
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
