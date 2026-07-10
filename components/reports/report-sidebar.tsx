'use client'

import { cn } from '@/lib/utils'
import { getAllReportDefinitions, getReportsByCategory } from '@/lib/reports/registry'
import type { ReportDefinition, ReportCategory } from '@/lib/reports/types'
import * as Icons from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  operational: 'Operational',
  financial:   'Financial',
  geographic:  'Geographic',
  technical:   'Technical',
  compliance:  'Compliance',
  customer:    'Customer',
}

const CATEGORY_ORDER: ReportCategory[] = [
  'operational',
  'financial',
  'geographic',
  'technical',
  'customer',
  'compliance',
]

interface ReportSidebarProps {
  activeReportId: string
  onSelect:       (id: string) => void
}

export function ReportSidebar({ activeReportId, onSelect }: ReportSidebarProps) {
  const all = getAllReportDefinitions()

  return (
    <aside className="w-64 shrink-0 border-r border-border/50 bg-muted/20 flex flex-col">
      <div className="px-4 py-3 border-b border-border/50">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Report Types
        </h2>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {all.length} reports available
        </p>
      </div>

      <ScrollArea className="flex-1 py-3">
        <div className="space-y-4 px-2">
          {CATEGORY_ORDER.map((cat) => {
            const reports = getReportsByCategory(cat)
            if (reports.length === 0) return null

            return (
              <div key={cat}>
                <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="space-y-0.5">
                  {reports.map((report) => (
                    <ReportNavItem
                      key={report.id}
                      report={report}
                      isActive={activeReportId === report.id}
                      onClick={() => onSelect(report.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}

function ReportNavItem({
  report,
  isActive,
  onClick,
}: {
  report:   ReportDefinition
  isActive: boolean
  onClick:  () => void
}) {
  const IconComp = report.icon
    ? ((Icons as Record<string, unknown>)[report.icon] as React.ElementType ?? null)
    : null

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 group',
        isActive
          ? 'bg-primary/10 text-primary border border-primary/15 shadow-sm'
          : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground border border-transparent',
      )}
    >
      {IconComp && (
        <IconComp className={cn(
          'size-3.5 shrink-0 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
        )} />
      )}
      <span className={cn(
        'text-[13px] truncate flex-1',
        isActive ? 'font-semibold' : 'font-medium',
      )}>
        {report.label}
      </span>
    </button>
  )
}
