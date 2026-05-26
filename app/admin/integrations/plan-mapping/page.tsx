import { IntegrationDataPage } from '@/app/admin/integrations/_components/integration-data-page'

export default function PlanMappingPage() {
  return (
    <IntegrationDataPage
      title="Plan Mapping"
      description="Unified system plans used by the website and provider fallback engine."
      endpoint="/api/admin/aggregator/plans"
      collectionKey="systemPlans"
      columns={[
        { key: 'system_plan_name', label: 'System Plan' },
        { key: 'amount', label: 'Amount' },
        { key: 'currency', label: 'Currency' },
        { key: 'validity', label: 'Validity' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'updated_at', label: 'Updated' },
      ]}
    />
  )
}
