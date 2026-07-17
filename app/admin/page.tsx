import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { loadAdminDashboardMetrics } from '@/lib/admin/dashboard-metrics'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const data = await loadAdminDashboardMetrics({ date: 'today' })
  return <DashboardContent initialData={data} />
}
