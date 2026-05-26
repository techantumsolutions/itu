import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const sections = [
  ['Service Providers', '/admin/integrations/providers', 'External aggregators, credentials, priority, and sync state.'],
  ['Provider Operators', '/admin/integrations/operators', 'Raw provider operators and unified system operators.'],
  ['Provider Plans', '/admin/integrations/plans', 'Raw provider plans and unified system plans.'],
  ['Duplicate Detection', '/admin/integrations/duplicates', 'Suggested duplicate plan matches for review.'],
  ['Operator Mapping', '/admin/integrations/operator-mapping', 'Manual operator mapping controls.'],
  ['Plan Mapping', '/admin/integrations/plan-mapping', 'Manual plan mapping controls.'],
  ['Sync Logs', '/admin/integrations/sync-logs', 'Historical sync runs, counts, errors, and retries.'],
  ['Cron Status', '/admin/integrations/cron-status', 'Cron and queue status.'],
] as const

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">Multi-provider aggregator control center for operators, plans, mappings, and sync.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/providers">API Providers</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/products">Products</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map(([title, href, description]) => (
          <Card key={href} className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 text-sm text-muted-foreground">Manage {title.toLowerCase()}.</CardContent>
            <CardFooter>
              <Button asChild className="w-full sm:w-auto">
                <Link href={href}>
                  Open
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
