'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Package } from 'lucide-react'

type InternalPlan = {
  id: string
  country_iso3: string
  operator_ref: string
  service: string
  subservice: string
  category: string
  uti_plan_name: string
  uti_description: string
  confidence: number
  active: boolean
  updated_at: string
}

export default function AdminProductsPage() {
  const [plans, setPlans] = useState<InternalPlan[]>([])

  useEffect(() => {
    void fetch('/api/admin/lcr/internal-plans?limit=100', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setPlans(Array.isArray(data?.internalPlans) ? data.internalPlans : []))
      .catch(() => setPlans([]))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-muted-foreground">Normalized internal product catalog from database ingestion.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-5" />
            Internal Plans
          </CardTitle>
          <CardDescription>Run provider sync/normalization to populate this table.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No products found in the database.
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="font-medium">{plan.uti_plan_name || plan.uti_description || plan.id}</div>
                      <div className="text-xs text-muted-foreground">{plan.service} {plan.subservice}</div>
                    </TableCell>
                    <TableCell>{plan.country_iso3 || '—'}</TableCell>
                    <TableCell>{plan.operator_ref || '—'}</TableCell>
                    <TableCell>{plan.category || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={plan.active ? 'default' : 'secondary'}>{plan.active ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell>{plan.updated_at ? new Date(plan.updated_at).toLocaleString() : '—'}</TableCell>
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
