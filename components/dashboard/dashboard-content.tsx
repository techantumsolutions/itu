'use client'

import { useEffect, useRef, useState } from 'react'
import type { DashboardDateFilter, DashboardMetrics } from '@/lib/admin/dashboard-metrics'
import { StatCards } from '@/components/dashboard/stat-cards'
import { TransactionsTable } from '@/components/dashboard/transactions-table'
import { TopProducts } from '@/components/dashboard/top-products'
import { SalesReport } from '@/components/dashboard/sales-report'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type DashboardContentProps = {
  initialData: DashboardMetrics
}

const ADMIN_LOCALE = 'en-US'
const ADMIN_REPORTING_CURRENCY = 'EUR'

export function DashboardContent({ initialData }: DashboardContentProps) {
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>(
    initialData.summary.date_filter ?? 'today',
  )
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)
  const skipFirstFetch = useRef(true)

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    void fetch(`/api/admin/dashboard?date=${encodeURIComponent(dateFilter)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return
        if (payload?.summary) {
          setData({
            summary: payload.summary,
            sales: Array.isArray(payload.sales) ? payload.sales : [],
            topProducts: Array.isArray(payload.topProducts) ? payload.topProducts : [],
          })
        }
      })
      .catch(() => {
        /* keep previous data */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dateFilter])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <Select
          value={dateFilter}
          onValueChange={(value) => setDateFilter(value as DashboardDateFilter)}
        >
          <SelectTrigger className="w-[160px]" disabled={loading}>
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <StatCards summary={data.summary} />
          <TransactionsTable
            reportingCurrency={ADMIN_REPORTING_CURRENCY}
            locale={ADMIN_LOCALE}
            dateFilter={dateFilter}
          />
        </div>
        <div className="flex flex-col gap-6 xl:col-span-4">
          <SalesReport summary={data.summary} />
          <TopProducts
            products={data.topProducts}
            reportingCurrency={ADMIN_REPORTING_CURRENCY}
            locale={ADMIN_LOCALE}
          />
        </div>
      </div>
    </div>
  )
}
