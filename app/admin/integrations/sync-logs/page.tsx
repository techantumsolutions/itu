import { IntegrationDataPage } from '@/app/admin/integrations/_components/integration-data-page'

export default function SyncLogsPage() {
  return (
    <IntegrationDataPage
      title="Sync Logs"
      description="Historical provider sync runs with counts, duration, and errors."
      endpoint="/api/admin/aggregator/sync-logs"
      collectionKey="logs"
      columns={[
        { key: 'sync_type', label: 'Type' },
        { key: 'stage', label: 'Stage' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'fetched_count', label: 'Fetched' },
        { key: 'mapped_count', label: 'Mapped' },
        { key: 'created_at', label: 'Created' },
      ]}
    />
  )
}
