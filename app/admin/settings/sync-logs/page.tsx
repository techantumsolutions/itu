'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'

export default function SyncLogsPage() {
  return (
    <IntegrationDataPage
      title="Sync Logs"
      description="Historical provider sync runs with counts, duration, and errors."
      endpoint="/api/admin/aggregator/sync-logs"
      collectionKey="logs"
      enableBulkSync={false}
      backLink={{ href: '/admin/settings?tab=system', label: 'Back to settings' }}
      filters={{ searchPlaceholder: 'Search type, stage, status…', hideCountry: true }}
      actions={
        <Button variant="outline" asChild>
          <Link href="/admin/providers">Sync from Providers</Link>
        </Button>
      }
      columns={[
        { key: 'sync_type', label: 'Type', secondaryKey: 'stage' },
        { key: 'status', label: 'Status', badge: true },
        { key: 'fetched_count', label: 'Counts', secondaryKey: 'mapped_count' },
        { key: 'created_at', label: 'Created', datetime: true },
      ]}
      renderRowActions={() => (
        <IntegrationRowActions>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/providers">Sync</Link>
          </Button>
        </IntegrationRowActions>
      )}
    />
  )
}
