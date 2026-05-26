'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'

export default function ProviderPlansPage() {
  return (
    <IntegrationDataPage
      title="Provider Plans"
      description="Raw provider plans captured from aggregator APIs for normalization and mapping."
      endpoint="/api/admin/aggregator/plans"
      collectionKey="rawPlans"
      filters={{ searchPlaceholder: 'Search plan name, ID, amount…' }}
      columns={[
        { key: 'provider_plan_name', label: 'Plan', secondaryKey: 'provider_plan_id' },
        { key: 'amount', label: 'Price', secondaryKey: 'currency' },
        { key: 'validity', label: 'Validity' },
        { key: 'status', label: 'Status', badge: true },
      ]}
      renderRowActions={() => (
        <IntegrationRowActions>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/products">Products</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/admin/integrations/plan-mapping">Map</Link>
          </Button>
        </IntegrationRowActions>
      )}
    />
  )
}
