import { IntegrationDataPage } from '@/app/admin/integrations/_components/integration-data-page'

export default function IntegrationProvidersPage() {
  return (
    <IntegrationDataPage
      title="Service Providers"
      description="External aggregators with priority, status, and sync metadata."
      endpoint="/api/admin/aggregator/providers"
      collectionKey="providers"
      columns={[
        { key: 'name', label: 'Provider' },
        { key: 'code', label: 'Code' },
        { key: 'adapter_key', label: 'Adapter' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'last_success_sync_at', label: 'Last Success' },
      ]}
    />
  )
}
