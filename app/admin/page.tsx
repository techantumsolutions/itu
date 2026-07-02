import { StatCards } from "@/components/dashboard/stat-cards"
import { TransactionsTable } from "@/components/dashboard/transactions-table"
import { TopProducts } from "@/components/dashboard/top-products"
import { DashboardSalesReport } from "@/components/dashboard/dashboard-sales-report"

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      {/* Main content and sidebar layout */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_340px]">
        {/* Left column - main content */}
        <div className="flex flex-col gap-6">
          {/* Stats row */}
          <StatCards />
          
          {/* Recent Transactions Table */}
          <TransactionsTable />
        </div>
        
        {/* Right column - sidebar widgets */}
        <div className="flex flex-col gap-6">
          <DashboardSalesReport />
          <TopProducts />
        </div>
      </div>
    </div>
  )
}
