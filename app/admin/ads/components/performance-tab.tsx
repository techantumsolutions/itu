'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

export function PerformanceTab() {
  const [analytics, setAnalytics] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ads/analytics')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAnalytics(data.analytics || [])
    } catch (e) {
      toast.error('Failed to load performance data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ad Performance</CardTitle>
        <CardDescription>View impressions, clicks, and dismissals across all your creatives.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Creative / Campaign</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Dismisses</TableHead>
              <TableHead className="text-right">CTR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Loading metrics...</TableCell></TableRow>
            ) : analytics.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No tracking data available yet.</TableCell></TableRow>
            ) : (
              analytics.map(row => {
                const ctr = row.impressions > 0 ? ((row.clicks / row.impressions) * 100).toFixed(2) : '0.00'
                return (
                  <TableRow key={row.creative_id}>
                    <TableCell>
                      <div className="font-medium">{row.title}</div>
                      <div className="text-xs text-muted-foreground">{row.campaign_name}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{row.placement}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{row.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-600 font-medium">{row.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-500">{row.dismisses.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{ctr}%</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
