'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type ReconciliationReport = {
  id: string
  provider: string | null
  period_start: string | null
  period_end: string | null
  status: string
  totals: Record<string, unknown>
  created_at: string
}

export default function ReconciliationPage() {
  const [reports, setReports] = useState<ReconciliationReport[]>([])

  useEffect(() => {
    void fetch('/api/admin/reconciliation', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setReports(Array.isArray(data?.reports) ? data.reports : []))
      .catch(() => setReports([]))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reconciliation</h1>
        <p className="text-muted-foreground">Database-backed reconciliation reports.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>No browser-persisted reconciliation data is used.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No reconciliation reports found.
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>{report.provider || '—'}</TableCell>
                    <TableCell>{report.period_start || '—'} to {report.period_end || '—'}</TableCell>
                    <TableCell><Badge>{report.status}</Badge></TableCell>
                    <TableCell>{report.created_at ? new Date(report.created_at).toLocaleString() : '—'}</TableCell>
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
