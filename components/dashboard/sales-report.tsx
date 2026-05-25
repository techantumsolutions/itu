"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"

export function SalesReport() {
  const [summary, setSummary] = useState({
    total_revenue: 0,
    total_orders: 0,
    completed_orders: 0,
    failed_orders: 0,
  })

  useEffect(() => {
    void fetch('/api/admin/dashboard', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const s = data?.summary ?? {}
        setSummary({
          total_revenue: Number(s.total_revenue) || 0,
          total_orders: Number(s.total_orders) || 0,
          completed_orders: Number(s.completed_orders) || 0,
          failed_orders: Number(s.failed_orders) || 0,
        })
      })
      .catch(() => {})
  }, [])

  const salesData = useMemo(() => {
    const pending = Math.max(0, summary.total_orders - summary.completed_orders - summary.failed_orders)
    return [
      { name: "Completed", value: summary.completed_orders, color: "hsl(var(--chart-1))" },
      { name: "Pending", value: pending, color: "hsl(var(--chart-2))" },
      { name: "Failed", value: summary.failed_orders, color: "hsl(var(--muted))" },
    ].filter((row) => row.value > 0)
  }, [summary])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <Card className="rounded-2xl border-border/70 shadow-elevated-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-xl font-semibold tracking-tight">Sales Report</CardTitle>
        <p className="text-sm text-muted-foreground">
          Quarterly Sales Performance Analysis
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Donut Chart */}
        <div className="relative h-[200px] flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={salesData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {salesData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">
              {formatCurrency(summary.total_revenue)}
            </span>
            <span className="text-sm text-muted-foreground">Summary</span>
          </div>
        </div>

        {/* Monthly / Yearly Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Monthly</p>
            <p className="text-xl font-bold">
              {formatCurrency(summary.total_revenue)}
            </p>
            <p className="text-xs text-muted-foreground">{summary.completed_orders} completed orders</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Yearly</p>
            <p className="text-xl font-bold">
              {formatCurrency(summary.total_revenue)}
            </p>
            <p className="text-xs text-muted-foreground">{summary.total_orders} total orders</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
