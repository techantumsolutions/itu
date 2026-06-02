'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'

export default function DuplicateDetectionPage() {
  return (
    <IntegrationDataPage
      title="Duplicate Detection"
      description="Suggested duplicate system-plan matches awaiting admin review."
      endpoint="/api/admin/aggregator/duplicates"
      collectionKey="suggestions"
      enableBulkSync={false}
      backLink={{ href: '/admin/settings?tab=system', label: 'Back to settings' }}
      filters={{ searchPlaceholder: 'Search match, reason, status…', hideCountry: true }}
      columns={[
        { key: 'match_score', label: 'Match', secondaryKey: 'match_reason' },
        { key: 'provider_plan_raw_id', label: 'Provider plan' },
        { key: 'suggested_system_plan_id', label: 'Suggested plan' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'created_at', label: 'Created', datetime: true },
      ]}
      renderRowActions={() => (
        <IntegrationRowActions>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/integrations/plans">Plans</Link>
          </Button>
        </IntegrationRowActions>
      )}
    />
  )
}
