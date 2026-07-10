'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import * as Icons from 'lucide-react'

import { ReportViewer } from '@/components/reports/report-viewer'
import { getReportDefinition } from '@/lib/reports/registry'
import { REPORT_TYPE } from '@/lib/reports/types'
import type { ReportDefinition } from '@/lib/reports/types'
import { cn } from '@/lib/utils'

const DEFAULT_REPORT = REPORT_TYPE.FINANCIAL

const TABS = [
  { id: REPORT_TYPE.FINANCIAL, label: 'Financial Report', icon: Icons.DollarSign },
  { id: 'country', label: 'Country Report', icon: Icons.Globe },
  { id: REPORT_TYPE.PROVIDER, label: 'Provider Report', icon: Icons.Building2 },
  { id: REPORT_TYPE.DESTINATION_NETWORK, label: 'Operator Report', icon: Icons.Signal },
  { id: REPORT_TYPE.TRANSACTIONS, label: 'Transaction Report', icon: Icons.ArrowRightLeft },
  { id: REPORT_TYPE.RECONCILIATION, label: 'Reconciliation Report', icon: Icons.Layers },
  { id: REPORT_TYPE.CUSTOMER, label: 'User Report', icon: Icons.Users },
]

export default function AdminReportsPage() {
  const [activeId, setActiveId] = useState<string>(DEFAULT_REPORT)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)

  const activeTabId = (activeId === REPORT_TYPE.DESTINATION_COUNTRY || activeId === REPORT_TYPE.ORIGIN_COUNTRY)
    ? 'country'
    : activeId

  const definition: ReportDefinition | undefined = getReportDefinition(activeId)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowLeftArrow(el.scrollLeft > 0)
    setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    checkScroll()

    el.addEventListener('scroll', checkScroll)
    window.addEventListener('resize', checkScroll)

    // Run again slightly later to ensure DOM layout settles
    const tid = setTimeout(checkScroll, 100)

    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
      clearTimeout(tid)
    }
  }, [checkScroll, activeId])

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const offset = direction === 'left' ? -200 : 200
    el.scrollBy({ left: offset, behavior: 'smooth' })
  }

  function handleTabSelect(tabId: string) {
    if (tabId === 'country') {
      setActiveId(REPORT_TYPE.DESTINATION_COUNTRY)
    } else {
      setActiveId(tabId)
    }
  }

  return (
    <div className="space-y-6 reports-page-container">
      {/* Top Tabs Navigator */}
      <div className="relative group">
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-[40%] -translate-y-1/2 z-10 bg-background/80 hover:bg-background border border-border shadow-md rounded-full p-1.5 text-muted-foreground hover:text-foreground transition-all duration-200"
          >
            <Icons.ChevronLeft className="size-4" />
          </button>
        )}
        
        <div
          ref={scrollRef}
          className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-border/40 scrollbar-none"
        >
          {TABS.map((tab) => {
            const TabIcon = tab.icon
            const isActive = activeTabId === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleTabSelect(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap border shrink-0",
                  isActive
                    ? "bg-primary/10 text-primary border-primary/25 shadow-sm"
                    : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/30"
                )}
              >
                <TabIcon className="size-3.5 shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-[40%] -translate-y-1/2 z-10 bg-background/80 hover:bg-background border border-border shadow-md rounded-full p-1.5 text-muted-foreground hover:text-foreground transition-all duration-200"
          >
            <Icons.ChevronRight className="size-4" />
          </button>
        )}
      </div>

      {/* Nested Country Switcher */}
      {activeTabId === 'country' && (
        <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border border-border/30 w-fit">
          <button
            onClick={() => setActiveId(REPORT_TYPE.DESTINATION_COUNTRY)}
            className={cn(
              "text-[11px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-md transition-all",
              activeId === REPORT_TYPE.DESTINATION_COUNTRY
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Destination Country
          </button>
          <button
            onClick={() => setActiveId(REPORT_TYPE.ORIGIN_COUNTRY)}
            className={cn(
              "text-[11px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-md transition-all",
              activeId === REPORT_TYPE.ORIGIN_COUNTRY
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Origin Country
          </button>
        </div>
      )}

      {/* Report Viewer Container */}
      {definition ? (
        <ReportViewer key={definition.id} definition={definition} />
      ) : (
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm border border-dashed rounded-xl">
          Select a report tab from above to get started.
        </div>
      )}
    </div>
  )
}
