'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'

export default function ProviderOperatorsPage() {
  return (
    <IntegrationDataPage
      title="Provider Operators"
      description="Raw provider operators plus system-ready operator metadata."
      endpoint="/api/admin/aggregator/operators"
      collectionKey="rawOperators"
      filters={{ searchPlaceholder: 'Search operator, ID, country…' }}
      columns={[
        { key: 'provider_operator_name', label: 'Operator', secondaryKey: 'provider_operator_id' },
        { key: 'iso_code', label: 'Country' },
        { key: 'operator_type', label: 'Type' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'fetched_at', label: 'Fetched', datetime: true },
      ]}
      renderRowActions={() => (
        <IntegrationRowActions>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/integrations/operator-mapping">Map</Link>
          </Button>
        </IntegrationRowActions>
      )}
    />
  )
}
