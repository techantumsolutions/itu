'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  AlertCircle,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUpIcon,
  Globe,
  Signal,
  Building,
  DollarSign,
  ArrowRightLeft,
  Activity,
  Layers,
} from 'lucide-react'
import type { ReportFilters } from '@/lib/reports/types'
import { cn } from '@/lib/utils'

interface ReportAnalyticsCardsProps {
  filters: ReportFilters
  currency?: string
}

type MetricData = {
  title: string
  key: string
  value: number | string
  prevValue: number | string
  trend: 'up' | 'down' | 'neutral'
  changePercent: number
  sparklineKey: string
  isCurrency: boolean
  isMilliseconds: boolean
  icon: React.ElementType
  tooltip: string
}

function formatValue(val: number | string, isCurrency: boolean, isMilliseconds: boolean, currency = 'EUR'): string {
  const num = Number(val)
  if (!Number.isFinite(num)) return String(val)

  if (isCurrency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num)
  }

  if (isMilliseconds) {
    if (num < 1000) return `${Math.round(num)}ms`
    return `${(num / 1000).toFixed(2)}s`
  }

  return new Intl.NumberFormat('en-US').format(num)
}

function SkeletonCard() {
  return (
    <Card className="border border-border/40 bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          <div className="h-5 w-5 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-7 w-28 bg-muted animate-pulse rounded" />
        <div className="h-3.5 w-32 bg-muted animate-pulse rounded" />
        <div className="h-9 w-full bg-muted/30 animate-pulse rounded" />
      </CardContent>
    </Card>
  )
}

export function ReportAnalyticsCards({ filters, currency = 'EUR' }: ReportAnalyticsCardsProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{ metrics: any; sparklines: any[] } | null>(null)

  useEffect(() => {
    let active = true

    async function loadStats() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/admin/reports/analytics-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? 'Failed to fetch analytics cards summary')
        }

        const json = await res.json()
        if (active && json.success) {
          setData(json.data)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load card aggregates')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadStats()

    return () => {
      active = false
    }
  }, [filters])

  if (error) {
    return (
      <Card className="border-rose-500/20 bg-rose-500/5 text-rose-600 p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider">Analytics Error</span>
        </div>
        <p className="text-sm mt-1 font-medium">{error}</p>
      </Card>
    )
  }

  if (loading || !data) {
    return (
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 bg-red-500">
        {Array.from({ length: 13 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  const { metrics, sparklines } = data
  const cur = metrics.current
  const prev = metrics.previous

  // Calculate percentage change helper
  const calcPct = (c: number, p: number) => {
    if (p <= 0) return c > 0 ? 100 : 0
    return parseFloat((((c - p) / p) * 100).toFixed(1))
  }

  const cardsList: MetricData[] = [
    {
      title: 'Total Recharges',
      key: 'total',
      value: cur.total,
      prevValue: prev.total,
      trend: cur.total > prev.total ? 'up' : cur.total < prev.total ? 'down' : 'neutral',
      changePercent: calcPct(cur.total, prev.total),
      sparklineKey: 'total',
      isCurrency: false,
      isMilliseconds: false,
      icon: FileText,
      tooltip: 'Total volume of recharge orders submitted during the range.',
    },
    {
      title: 'Successful',
      key: 'successful',
      value: cur.successful,
      prevValue: prev.successful,
      trend: cur.successful > prev.successful ? 'up' : cur.successful < prev.successful ? 'down' : 'neutral',
      changePercent: calcPct(cur.successful, prev.successful),
      sparklineKey: 'successful',
      isCurrency: false,
      isMilliseconds: false,
      icon: CheckCircle,
      tooltip: 'Completed recharges successfully credited to destination numbers.',
    },
    {
      title: 'Failed',
      key: 'failed',
      value: cur.failed,
      prevValue: prev.failed,
      trend: cur.failed < prev.failed ? 'up' : cur.failed > prev.failed ? 'down' : 'neutral', // Less failure is up
      changePercent: calcPct(cur.failed, prev.failed),
      sparklineKey: 'failed',
      isCurrency: false,
      isMilliseconds: false,
      icon: XCircle,
      tooltip: 'Errored, timed-out, or explicitly failed recharge orders.',
    },
    {
      title: 'Pending',
      key: 'pending',
      value: cur.pending,
      prevValue: prev.pending,
      trend: 'neutral',
      changePercent: calcPct(cur.pending, prev.pending),
      sparklineKey: 'pending',
      isCurrency: false,
      isMilliseconds: false,
      icon: Clock,
      tooltip: 'Orders currently processing or pending callback validation.',
    },
    {
      title: 'Revenue',
      key: 'revenue',
      value: cur.revenue,
      prevValue: prev.revenue,
      trend: cur.revenue > prev.revenue ? 'up' : cur.revenue < prev.revenue ? 'down' : 'neutral',
      changePercent: calcPct(cur.revenue, prev.revenue),
      sparklineKey: 'revenue',
      isCurrency: true,
      isMilliseconds: false,
      icon: TrendingUpIcon,
      tooltip: 'Total gross value of successful recharges computed in base reporting currency.',
    },
    {
      title: 'Provider Cost',
      key: 'providerCost',
      value: cur.providerCost,
      prevValue: prev.providerCost,
      trend: cur.providerCost > prev.providerCost ? 'down' : cur.providerCost < prev.providerCost ? 'up' : 'neutral', // Higher cost is down
      changePercent: calcPct(cur.providerCost, prev.providerCost),
      sparklineKey: 'providerCost',
      isCurrency: true,
      isMilliseconds: false,
      icon: DollarSign,
      tooltip: 'Total cost charged by top-up suppliers (DTOne, Ding Connect, etc.) in base currency.',
    },
    {
      title: 'Net Profit',
      key: 'profit',
      value: cur.profit,
      prevValue: prev.profit,
      trend: cur.profit > prev.profit ? 'up' : cur.profit < prev.profit ? 'down' : 'neutral',
      changePercent: calcPct(cur.profit, prev.profit),
      sparklineKey: 'profit',
      isCurrency: true,
      isMilliseconds: false,
      icon: Layers,
      tooltip: 'Platform margins/recharge processing fees accrued (Revenue minus Provider Cost).',
    },
    {
      title: 'Refunds',
      key: 'refunds',
      value: cur.refunds,
      prevValue: prev.refunds,
      trend: cur.refunds < prev.refunds ? 'up' : cur.refunds > prev.refunds ? 'down' : 'neutral',
      changePercent: calcPct(cur.refunds, prev.refunds),
      sparklineKey: 'refunds',
      isCurrency: false,
      isMilliseconds: false,
      icon: ArrowRightLeft,
      tooltip: 'Total number of transactions marked as refunded during the selected period.',
    },
    {
      title: 'Avg Recharge',
      key: 'avgRecharge',
      value: cur.avgRecharge,
      prevValue: prev.avgRecharge,
      trend: cur.avgRecharge > prev.avgRecharge ? 'up' : cur.avgRecharge < prev.avgRecharge ? 'down' : 'neutral',
      changePercent: calcPct(cur.avgRecharge, prev.avgRecharge),
      sparklineKey: 'revenue', // Map to revenue trend for graph shape
      isCurrency: true,
      isMilliseconds: false,
      icon: Activity,
      tooltip: 'Average order value computed across successful recharges.',
    },
    {
      title: 'Avg Latency',
      key: 'latency',
      value: cur.latency,
      prevValue: prev.latency,
      trend: cur.latency < prev.latency ? 'up' : cur.latency > prev.latency ? 'down' : 'neutral', // lower latency is up
      changePercent: calcPct(cur.latency, prev.latency),
      sparklineKey: 'total', // Map to total volume for shape fallback
      isCurrency: false,
      isMilliseconds: true,
      icon: Clock,
      tooltip: 'Average response/latency time measured from supplier API calls.',
    },
    {
      title: 'Countries',
      key: 'countries',
      value: cur.countriesCount,
      prevValue: prev.countriesCount,
      trend: cur.countriesCount > prev.countriesCount ? 'up' : cur.countriesCount < prev.countriesCount ? 'down' : 'neutral',
      changePercent: calcPct(cur.countriesCount, prev.countriesCount),
      sparklineKey: 'countriesCount',
      isCurrency: false,
      isMilliseconds: false,
      icon: Globe,
      tooltip: 'Unique destination countries matching recharges submitted in range.',
    },
    {
      title: 'Networks',
      key: 'networks',
      value: cur.networksCount,
      prevValue: prev.networksCount,
      trend: cur.networksCount > prev.networksCount ? 'up' : cur.networksCount < prev.networksCount ? 'down' : 'neutral',
      changePercent: calcPct(cur.networksCount, prev.networksCount),
      sparklineKey: 'networksCount',
      isCurrency: false,
      isMilliseconds: false,
      icon: Signal,
      tooltip: 'Unique operators or mobile networks top-ups were sent to.',
    },
    {
      title: 'Providers',
      key: 'providers',
      value: cur.providersCount,
      prevValue: prev.providersCount,
      trend: 'neutral',
      changePercent: 0,
      sparklineKey: 'providersCount',
      isCurrency: false,
      isMilliseconds: false,
      icon: Building,
      tooltip: 'Number of active wholesale suppliers matching routing logs in filter set.',
    },
  ]

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {cardsList.map((card) => {
          const IconComp = card.icon
          const hasChange = card.changePercent !== 0

          // Color resolution based on trend values
          const isUp = card.trend === 'up'
          const isDown = card.trend === 'down'

          const trendColor = isUp
            ? 'text-emerald-500 fill-emerald-500'
            : isDown
              ? 'text-rose-500 fill-rose-500'
              : 'text-muted-foreground'

          const sparklineColor = isUp
            ? 'var(--color-emerald-500, #10b981)'
            : isDown
              ? 'var(--color-rose-500, #ef4444)'
              : 'var(--color-primary, #6366f1)'

          // Map values for Recharts micro line
          const sparklineData = sparklines.map((p) => ({
            value: Number(p[card.sparklineKey]) || 0,
          }))

          return (
            <Card
              key={card.key}
              className="border border-border/40 bg-card hover:border-primary/15 transition-all duration-200"
            >
              <CardContent className="p-3.5 space-y-1.5 flex flex-col justify-between h-full min-h-[140px]">

                {/* Title and Tooltip */}
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                    {card.title}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground/60 hover:text-foreground shrink-0 focus:outline-none">
                        <HelpCircle className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      {card.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Display Value */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-lg font-bold tracking-tight tabular-nums truncate">
                    {formatValue(card.value, card.isCurrency, card.isMilliseconds, currency)}
                  </span>

                  {/* Trend Indicator */}
                  <div className="flex items-center gap-1 text-[10px] font-medium min-h-[14px]">
                    {isUp && <TrendingUp className={cn("size-3 shrink-0", trendColor)} />}
                    {isDown && <TrendingDown className={cn("size-3 shrink-0", trendColor)} />}
                    {card.trend === 'neutral' && <Minus className={cn("size-3 shrink-0", trendColor)} />}

                    <span className={cn("truncate font-semibold", trendColor)}>
                      {hasChange ? `${card.changePercent > 0 ? '+' : ''}${card.changePercent}%` : '—'}
                    </span>
                  </div>
                </div>

                {/* Micro sparkline */}
                <div className="h-6 w-full shrink-0">
                  {sparklineData.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparklineData} margin={{ top: 2, bottom: 2, left: 1, right: 1 }}>
                        <defs>
                          <linearGradient id={`grad-${card.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={sparklineColor} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={sparklineColor} stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={sparklineColor}
                          strokeWidth={1.5}
                          fill={`url(#grad-${card.key})`}
                          dot={false}
                          activeDot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full border-t border-dashed border-border/40" />
                  )}
                </div>

              </CardContent>
            </Card>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
