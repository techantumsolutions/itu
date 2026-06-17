'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage } from '@/app/admin/integrations/_components/integration-data-page'

export default function TelecomRegistryPage() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') === 'legacy' ? 'legacy' : 'domain'

  const endpoint = `/api/admin/aggregator/telecom-registry?view=${view}`

  const columns =
    view === 'legacy'
      ? [
          { key: 'country_iso3', label: 'Country' },
          { key: 'operator_name', label: 'Operator', secondaryKey: 'normalized_name' },
          { key: 'operator_domain', label: 'Domain', badge: true },
          { key: 'confidence', label: 'Confidence' },
          { key: 'is_verified', label: 'Verified' },
        ]
      : [
          { key: 'country_iso3', label: 'Country' },
          { key: 'operator_name', label: 'Operator', secondaryKey: 'normalized_name' },
          { key: 'mcc', label: 'MCC', secondaryKey: 'mnc' },
          { key: 'aliases_json', label: 'Aliases' },
          { key: 'source', label: 'Source', badge: true },
        ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant={view === 'domain' ? 'default' : 'outline'} size="sm" asChild>
          <Link href="/admin/integrations/telecom-registry">Full registry</Link>
        </Button>
        <Button variant={view === 'legacy' ? 'default' : 'outline'} size="sm" asChild>
          <Link href="/admin/integrations/telecom-registry?view=legacy">operator_domain_registry</Link>
        </Button>
      </div>
      <IntegrationDataPage
        title={view === 'legacy' ? 'Operator domain registry' : 'Telecom operator registry'}
        description={
          view === 'legacy'
            ? 'Country-scoped MOBILE operators used by CatalogIntelligenceEngine. Filter by country ISO3.'
            : 'Global MCC/MNC telecom operator registry (domain_operator_registry). Step 5 sync uses this table for mandatory domain validation.'
        }
        endpoint={endpoint}
        collectionKey="operators"
        filters={{
          searchPlaceholder: 'Search operator name, normalized name, slug…',
          countryKey: 'country_iso3',
        }}
        columns={columns}
        backLink={{ href: '/admin/integrations', label: 'Integrations' }}
      />
    </div>
  )
}
