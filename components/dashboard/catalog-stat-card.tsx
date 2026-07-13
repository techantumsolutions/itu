'use client'

import { ChevronRight, Globe, Package, RadioTower } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCompactNumber } from '@/lib/format/compact-number'
import { formatSyncStatusLabel } from '@/lib/format/sync-status-label'

export type CatalogStatCardProps = {
  operators: number
  plans: number
  countries: number
  syncedAt?: string | null
  className?: string
}

type CatalogMetricProps = {
  value: number
  label: string
  icon: React.ComponentType<{ className?: string }>
}

function CatalogMetric({ value, label, icon: Icon }: CatalogMetricProps) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center md:items-start md:text-left">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground/70">
        <Icon className="size-3.5 shrink-0" aria-hidden />
      </div>
      <p className="text-2xl font-bold tracking-tight tabular-nums md:text-[1.65rem]">
        {formatCompactNumber(value)}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export function CatalogStatCard({ operators, plans, countries, syncedAt, className }: CatalogStatCardProps) {
  const footer = formatSyncStatusLabel(syncedAt ?? null)

  return (
    <Card
      className={cn(
        'relative overflow-hidden md:col-span-2 rounded-2xl border-border/70 transition-colors hover:border-border',
        className,
      )}
    >
      <CardContent className="flex h-full flex-col px-6 sm:px-7">
        <div className="grid flex-1 grid-cols-1 gap-5 md:grid-cols-3 md:gap-3">
          <CatalogMetric value={operators} label="Operators" icon={RadioTower} />
          <CatalogMetric value={plans} label="Plans" icon={Package} />
          <CatalogMetric value={countries} label="Countries" icon={Globe} />
        </div>
      </CardContent>
    </Card>
  )
}
