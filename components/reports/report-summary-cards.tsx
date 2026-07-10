'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import * as Icons from 'lucide-react'
import type { SummaryCard } from '@/lib/reports/types'
import { cn } from '@/lib/utils'
import type React from 'react'

interface ReportSummaryCardsProps {
  cards: SummaryCard[]
  loading?: boolean
  currency?: string
}

function formatValue(card: SummaryCard): string {
  if (typeof card.value === 'number') {
    if (card.currency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: card.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(card.value)
    }
    const formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: card.suffix === '%' ? 1 : 0,
    }).format(card.value)
    return formatted + (card.suffix ?? '')
  }
  return String(card.value) + (card.suffix ?? '')
}

function SkeletonCard() {
  return (
    <Card className="border border-border/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
            <div className="h-7 w-36 rounded bg-muted animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-9 w-9 rounded-lg bg-muted animate-pulse ml-4" />
        </div>
      </CardContent>
    </Card>
  )
}

export function ReportSummaryCards({ cards, loading }: ReportSummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (!cards || cards.length === 0) return null

  return (
    <div className={cn(
      'grid gap-4',
      cards.length === 2 && 'grid-cols-2',
      cards.length === 3 && 'grid-cols-3',
      cards.length >= 4 && 'grid-cols-2 lg:grid-cols-4',
    )}>
      {cards.map((card) => {
        // Resolve lucide icon
        const IconComp = card.icon
          ? ((Icons as Record<string, unknown>)[card.icon] as React.ElementType ?? null)
          : null

        const trendDir  = card.trendDir ?? (card.trend === undefined ? 'neutral' : card.trend > 0 ? 'up' : card.trend < 0 ? 'down' : 'neutral')
        const hasTrend  = card.trend !== undefined

        return (
          <Card
            key={card.id}
            className="border border-border/40 hover:border-primary/20 transition-all duration-200 hover:shadow-sm group"
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 truncate">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                    {formatValue(card)}
                  </p>
                  {hasTrend && (
                    <div className={cn(
                      'flex items-center gap-1 mt-2 text-xs font-medium',
                      trendDir === 'up'      && 'text-emerald-500',
                      trendDir === 'down'    && 'text-rose-500',
                      trendDir === 'neutral' && 'text-muted-foreground',
                    )}>
                      {trendDir === 'up'      && <TrendingUp   className="size-3" />}
                      {trendDir === 'down'    && <TrendingDown  className="size-3" />}
                      {trendDir === 'neutral' && <Minus         className="size-3" />}
                      <span>
                        {card.trend !== undefined && card.trend !== 0 && (
                          `${card.trend > 0 ? '+' : ''}${card.trend.toFixed(1)}%`
                        )}
                        {' vs prev period'}
                      </span>
                    </div>
                  )}
                  {card.description && (
                    <p className="text-xs text-muted-foreground/70 mt-1">{card.description}</p>
                  )}
                </div>

                {IconComp && (
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center group-hover:bg-primary/15 transition-colors duration-200">
                    <IconComp className="size-4 text-primary" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
