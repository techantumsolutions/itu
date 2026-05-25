'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Route } from 'lucide-react'

type ProviderRow = {
  id: string
  code: string
  name: string
  adapter_key: string
  is_active: boolean
  priority: number
  status: string
  supported_countries?: string[]
}

export default function AdminRoutingPage() {
  const [providers, setProviders] = useState<ProviderRow[]>([])

  useEffect(() => {
    void fetch('/api/admin/lcr/providers', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setProviders(Array.isArray(data?.providers) ? data.providers : []))
      .catch(() => setProviders([]))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Routing</h1>
        <p className="text-muted-foreground">Database-backed LCR provider routing state.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="size-5" />
            Provider Priority
          </CardTitle>
          <CardDescription>Configure providers in the Providers page. No mock routing rules are shown.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Adapter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Countries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No providers configured in the database.
                  </TableCell>
                </TableRow>
              ) : (
                providers.map((provider) => (
                  <TableRow key={provider.id}>
                    <TableCell>{provider.priority}</TableCell>
                    <TableCell>
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-xs text-muted-foreground">{provider.code}</div>
                    </TableCell>
                    <TableCell>{provider.adapter_key}</TableCell>
                    <TableCell>
                      <Badge variant={provider.is_active ? 'default' : 'secondary'}>{provider.status || (provider.is_active ? 'active' : 'inactive')}</Badge>
                    </TableCell>
                    <TableCell>{provider.supported_countries?.join(', ') || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
