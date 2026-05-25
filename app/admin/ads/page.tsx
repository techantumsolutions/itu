'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Megaphone } from 'lucide-react'

type AdRow = {
  id: string
  title: string
  placement: string
  status: string
  target_countries: string[]
  image_url: string | null
  link_url: string | null
  starts_at: string | null
  ends_at: string | null
  updated_at: string
}

export default function AdminAdsPage() {
  const [ads, setAds] = useState<AdRow[]>([])

  useEffect(() => {
    void fetch('/api/admin/ads', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setAds(Array.isArray(data?.ads) ? data.ads : []))
      .catch(() => setAds([]))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ads Manager</h1>
        <p className="text-muted-foreground">Database-backed ad campaigns.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-5" />
            Campaigns
          </CardTitle>
          <CardDescription>Create campaigns by inserting rows into the `ads` table or wiring a form to `/api/admin/ads`.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Placement</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Countries</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No ad campaigns found.
                  </TableCell>
                </TableRow>
              ) : (
                ads.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell>{ad.title}</TableCell>
                    <TableCell>{ad.placement}</TableCell>
                    <TableCell><Badge>{ad.status}</Badge></TableCell>
                    <TableCell>{ad.target_countries?.join(', ') || 'All'}</TableCell>
                    <TableCell>{ad.updated_at ? new Date(ad.updated_at).toLocaleString() : '—'}</TableCell>
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
