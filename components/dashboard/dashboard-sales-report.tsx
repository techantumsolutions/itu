'use client'

import dynamic from 'next/dynamic'

export const DashboardSalesReport = dynamic(
  () => import('./sales-report').then((m) => ({ default: m.SalesReport })),
  {
    ssr: false,
    loading: () => <div className="h-[280px] animate-pulse rounded-xl bg-muted" />,
  },
)
