import { IntegrationDataPage } from '@/app/admin/integrations/_components/integration-data-page'

export default function DuplicateDetectionPage() {
  return (
    <IntegrationDataPage
      title="Duplicate Detection"
      description="Suggested duplicate system-plan matches awaiting admin review."
      endpoint="/api/admin/aggregator/duplicates"
      collectionKey="suggestions"
      columns={[
        { key: 'match_score', label: 'Match %' },
        { key: 'match_reason', label: 'Reason' },
        { key: 'provider_plan_raw_id', label: 'Provider Plan' },
        { key: 'suggested_system_plan_id', label: 'Suggested System Plan' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'created_at', label: 'Created' },
      ]}
    />
  )
}
