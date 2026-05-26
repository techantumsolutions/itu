import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const sections = [
  ['Service Providers', '/admin/integrations/providers', 'External aggregators, credentials, priority, and sync state.'],
  ['Provider Operators', '/admin/integrations/operators', 'Raw provider operators and unified system operators.'],
  ['Provider Plans', '/admin/integrations/plans', 'Raw provider plans and unified system plans.'],
  ['Duplicate Detection', '/admin/integrations/duplicates', 'Suggested duplicate plan matches for review.'],
  ['Operator Mapping', '/admin/integrations/operator-mapping', 'Manual operator mapping controls.'],
  ['Plan Mapping', '/admin/integrations/plan-mapping', 'Manual plan mapping controls.'],
  ['Sync Logs', '/admin/integrations/sync-logs', 'Historical sync runs, counts, errors, and retries.'],
  ['Cron Status', '/admin/integrations/cron-status', 'Queue and scheduler status.'],
] as const

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">Multi-provider aggregator control center for operators, plans, mappings, and sync.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map(([title, href, description]) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  {title}
                  <Badge variant="outline">Open</Badge>
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Manage {title.toLowerCase()}.</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
