import { IntegrationDataPage } from '@/app/admin/integrations/_components/integration-data-page'

export default function ProviderOperatorsPage() {
  return (
    <IntegrationDataPage
      title="Provider Operators"
      description="Raw provider operators plus system-ready operator metadata."
      endpoint="/api/admin/aggregator/operators"
      collectionKey="rawOperators"
      columns={[
        { key: 'provider_operator_name', label: 'Provider Operator' },
        { key: 'provider_operator_id', label: 'Provider ID' },
        { key: 'iso_code', label: 'Country' },
        { key: 'operator_type', label: 'Type' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'fetched_at', label: 'Fetched' },
      ]}
    />
  )
}
