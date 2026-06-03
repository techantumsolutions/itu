'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'

export default function ProviderPlansPage() {
  const searchParams = useSearchParams()
  const operatorRawId = searchParams.get('operatorRawId')
  const systemOperatorId = searchParams.get('systemOperatorId')

  let endpoint = '/api/admin/aggregator/plans'
  const query = new URLSearchParams()
  if (operatorRawId) query.set('operatorRawId', operatorRawId)
  if (systemOperatorId) query.set('systemOperatorId', systemOperatorId)

  const queryString = query.toString()
  if (queryString) {
    endpoint = `${endpoint}?${queryString}`
  }

  // If filtering by systemOperatorId, we want to view system plans; otherwise raw plans.
  const collectionKey = systemOperatorId ? 'systemPlans' : 'rawPlans'

  const columns = systemOperatorId
    ? [
        { key: 'system_plan_name', label: 'Plan', secondaryKey: 'slug' },
        { key: 'amount', label: 'Price', secondaryKey: 'currency' },
        { key: 'validity', label: 'Validity' },
        { key: 'status', label: 'Status', badge: true },
      ]
    : [
        { key: 'provider_plan_name', label: 'Plan', secondaryKey: 'provider_plan_id' },
        { key: 'amount', label: 'Price', secondaryKey: 'currency' },
        { key: 'validity', label: 'Validity' },
        { key: 'status', label: 'Status', badge: true },
      ]

  return (
    <IntegrationDataPage
      title={systemOperatorId ? "System Plans" : "Provider Plans"}
      description={
        systemOperatorId
          ? "Unified system plans for the selected operator."
          : "Raw provider plans captured from aggregator APIs for normalization and mapping."
      }
      endpoint={endpoint}
      collectionKey={collectionKey}
      filters={{ searchPlaceholder: 'Search plan name, ID, amount…' }}
      columns={columns}
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
