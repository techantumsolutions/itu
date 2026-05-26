import { IntegrationDataPage } from '@/app/admin/integrations/_components/integration-data-page'

export default function ProviderPlansPage() {
  return (
    <IntegrationDataPage
      title="Provider Plans"
      description="Raw provider plans captured from aggregator APIs for normalization and mapping."
      endpoint="/api/admin/aggregator/plans"
      collectionKey="rawPlans"
      columns={[
        { key: 'provider_plan_name', label: 'Provider Plan' },
        { key: 'provider_plan_id', label: 'Provider Plan ID' },
        { key: 'amount', label: 'Amount' },
        { key: 'currency', label: 'Currency' },
        { key: 'validity', label: 'Validity' },
        { key: 'status', label: 'Status', badge: true },
      ]}
    />
  )
}
