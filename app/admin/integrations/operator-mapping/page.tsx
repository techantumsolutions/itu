import { IntegrationDataPage } from '@/app/admin/integrations/_components/integration-data-page'

export default function OperatorMappingPage() {
  return (
    <IntegrationDataPage
      title="Operator Mapping"
      description="Review raw operators and map them to unified system operators."
      endpoint="/api/admin/aggregator/operators"
      collectionKey="systemOperators"
      columns={[
        { key: 'system_operator_name', label: 'System Operator' },
        { key: 'country_id', label: 'Country' },
        { key: 'operator_type', label: 'Type' },
        { key: 'slug', label: 'Slug' },
        { key: 'status', label: 'Status' },
        { key: 'updated_at', label: 'Updated' },
      ]}
    />
  )
}
