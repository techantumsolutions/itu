import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { loadAdminDashboardMetrics } from '@/lib/admin/dashboard-metrics'

export default async function DashboardPage() {
  const data = await loadAdminDashboardMetrics()
  return <DashboardContent data={data} />
}
