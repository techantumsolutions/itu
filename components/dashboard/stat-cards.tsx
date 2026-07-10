'use client'

import { ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/lib/admin/dashboard-metrics'
import { CatalogStatCard } from '@/components/dashboard/catalog-stat-card'

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  change?: number
  trend?: 'up' | 'down'
}

function StatCard({ title, value, subtitle, change = 0, trend = 'up' }: StatCardProps) {
  const isPositive = trend === 'up'

  return (
    <Card className="relative overflow-hidden rounded-2xl border-border/70 transition-colors hover:border-border">
      <CardContent className="px-6 sm:px-7">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              {/* <Button variant="ghost" size="icon" className="size-6 -mr-2 -mt-2">
                <ChevronRight className="size-4" />
              </Button> */}
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
            {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
            {change !== 0 ? (
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
                    isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
                  )}
                >
                  {isPositive ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {Math.abs(change)}%
                </span>
                <span className="text-xs text-muted-foreground">Vs last month</span>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

type StatCardsProps = {
  summary: DashboardSummary
}

export function StatCards({ summary }: StatCardsProps) {
  const currency = 'EUR'
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)

  const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <StatCard
        title="ITU Revenue"
        value={formatCurrency(summary.itu_revenue ?? summary.total_margin)}
        subtitle="Gross − Refunds − Provider Cost"
      />
      <CatalogStatCard
        operators={summary.total_operators}
        plans={summary.total_plans}
        countries={summary.total_countries}
        syncedAt={summary.catalog_synced_at}
      />
      <StatCard
        title="Total Recharges"
        value={formatNumber(summary.total_orders)}
        subtitle={`${formatNumber(summary.completed_orders)} success · ${formatNumber(summary.failed_orders)} failed · ${formatNumber(summary.pending_orders)} pending`}
      />
      <StatCard
        title="Total Customers"
        value={formatNumber(summary.total_users)}
        subtitle="Registered customer accounts"
      />
    </div>
  )
}
