'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { DashboardSummary } from '@/lib/admin/dashboard-metrics'

const CHART_COLORS = {
  completed: 'hsl(142 76% 36%)',
  failed: 'hsl(0 84% 60%)',
  pending: 'hsl(45 93% 47%)',
}

type SalesReportProps = {
  summary: DashboardSummary
}

export function SalesReport({ summary }: SalesReportProps) {
  const salesData = useMemo(() => {
    return [
      { name: 'Successful', value: summary.completed_orders, color: CHART_COLORS.completed },
      { name: 'Failed', value: summary.failed_orders, color: CHART_COLORS.failed },
      { name: 'Pending', value: summary.pending_orders, color: CHART_COLORS.pending },
    ].filter((row) => row.value > 0)
  }, [summary])

  const currency = 'EUR'

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)

  const successRate =
    summary.total_orders > 0
      ? Math.round((summary.completed_orders / summary.total_orders) * 100)
      : 0

  return (
    <Card className="rounded-2xl border-border/70 shadow-elevated-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-xl font-semibold tracking-tight">Sales Report</CardTitle>
        <p className="text-sm text-muted-foreground">Recharge outcomes and margin summary</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="relative flex h-[220px] items-center justify-center">
          {salesData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={salesData}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {salesData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, 'Recharges']} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No recharge data yet.</p>
          )}
          {salesData.length > 0 ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
              <span className="text-xl font-bold">{formatCurrency(summary.total_margin)}</span>
              <span className="text-xs text-muted-foreground">Total margin</span>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Successful</p>
            <p className="text-xl font-bold">{summary.completed_orders}</p>
            <p className="text-xs text-muted-foreground">{successRate}% success rate</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Failed</p>
            <p className="text-xl font-bold">{summary.failed_orders}</p>
            <p className="text-xs text-muted-foreground">{summary.pending_orders} pending</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
