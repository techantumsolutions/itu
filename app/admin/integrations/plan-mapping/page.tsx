'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'

export default function PlanMappingPage() {
  return (
    <IntegrationDataPage
      title="Plan Mapping"
      description="Unified system plans used by the website and provider fallback engine."
      endpoint="/api/admin/aggregator/plans"
      collectionKey="systemPlans"
      filters={{ searchPlaceholder: 'Search plan, amount, validity…' }}
      columns={[
        { key: 'system_plan_name', label: 'System Plan' },
        { key: 'amount', label: 'Price', secondaryKey: 'currency' },
        { key: 'validity', label: 'Validity' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'updated_at', label: 'Updated', datetime: true },
      ]}
      renderRowActions={() => (
        <IntegrationRowActions>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/products">Products</Link>
          </Button>
        </IntegrationRowActions>
      )}
    />
  )
}
