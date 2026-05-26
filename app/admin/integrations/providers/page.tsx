'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'

export default function IntegrationProvidersPage() {
  return (
    <IntegrationDataPage
      title="Service Providers"
      description="External aggregators with priority, status, and sync metadata."
      endpoint="/api/admin/aggregator/providers"
      collectionKey="providers"
      filters={{ searchPlaceholder: 'Search provider, code, adapter…', hideCountry: true }}
      columns={[
        { key: 'name', label: 'Provider', secondaryKey: 'code' },
        { key: 'adapter_key', label: 'Adapter', secondaryKey: 'priority' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'last_success_sync_at', label: 'Last sync', datetime: true },
      ]}
      renderRowActions={(row, { syncProvider, syncingId }) => {
        const id = String(row.id ?? '')
        return (
          <IntegrationRowActions>
            <Button
              size="sm"
              variant="outline"
              disabled={!id || syncingId === id}
              onClick={() => void syncProvider(id)}
            >
              {syncingId === id ? '…' : 'Sync'}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/admin/providers">Manage</Link>
            </Button>
          </IntegrationRowActions>
        )
      }}
    />
  )
}
