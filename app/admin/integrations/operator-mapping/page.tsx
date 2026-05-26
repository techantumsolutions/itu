'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'

export default function OperatorMappingPage() {
  return (
    <IntegrationDataPage
      title="Operator Mapping"
      description="Review raw operators and map them to unified system operators."
      endpoint="/api/admin/aggregator/operators"
      collectionKey="systemOperators"
      filters={{ searchPlaceholder: 'Search operator, country, type…' }}
      columns={[
        { key: 'system_operator_name', label: 'Operator', secondaryKey: 'country_id' },
        { key: 'operator_type', label: 'Type' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'updated_at', label: 'Updated', datetime: true },
      ]}
      renderRowActions={() => (
        <IntegrationRowActions>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/integrations/operators">Raw</Link>
          </Button>
        </IntegrationRowActions>
      )}
    />
  )
}
