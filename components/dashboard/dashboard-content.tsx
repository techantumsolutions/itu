import type { DashboardMetrics } from '@/lib/admin/dashboard-metrics'
import { StatCards } from '@/components/dashboard/stat-cards'
import { TransactionsTable } from '@/components/dashboard/transactions-table'
import { TopProducts } from '@/components/dashboard/top-products'
import { SalesReport } from '@/components/dashboard/sales-report'

type DashboardContentProps = {
  data: DashboardMetrics
}

const ADMIN_LOCALE = 'en-US'
const ADMIN_REPORTING_CURRENCY = 'EUR'

export function DashboardContent({ data }: DashboardContentProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <StatCards summary={data.summary} />
          <TransactionsTable reportingCurrency={ADMIN_REPORTING_CURRENCY} locale={ADMIN_LOCALE} />
        </div>
        <div className="flex flex-col gap-6 xl:col-span-4">
          <SalesReport summary={data.summary} />
          <TopProducts products={data.topProducts} reportingCurrency={ADMIN_REPORTING_CURRENCY} locale={ADMIN_LOCALE} />
        </div>
      </div>
    </div>
  )
}
