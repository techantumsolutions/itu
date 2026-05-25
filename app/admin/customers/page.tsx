'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Users } from 'lucide-react'

type CustomerRow = {
  user_id: string
  email: string | null
  name: string | null
  total_spend: number | string | null
  transaction_count: number | string | null
  last_transaction_at: string | null
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    void fetch('/api/admin/customers', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setCustomers(Array.isArray(data?.customers) ? data.customers : []))
      .catch(() => setCustomers([]))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => `${c.email ?? ''} ${c.name ?? ''} ${c.user_id}`.toLowerCase().includes(q))
  }, [customers, search])

  const totalSpend = customers.reduce((sum, c) => sum + (Number(c.total_spend) || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-muted-foreground">Database-backed customer profiles and transaction totals.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Customers</CardDescription>
            <CardTitle>{customers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Spend</CardDescription>
            <CardTitle>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalSpend)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With Transactions</CardDescription>
            <CardTitle>{customers.filter((c) => Number(c.transaction_count) > 0).length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                Customer Directory
              </CardTitle>
              <CardDescription>Shows empty state when the database has no customer profiles.</CardDescription>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers..." className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Transactions</TableHead>
                <TableHead>Total Spend</TableHead>
                <TableHead>Last Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((customer) => (
                  <TableRow key={customer.user_id}>
                    <TableCell>{customer.name || 'Unnamed'}</TableCell>
                    <TableCell>{customer.email || '—'}</TableCell>
                    <TableCell>{Number(customer.transaction_count) || 0}</TableCell>
                    <TableCell>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(customer.total_spend) || 0)}</TableCell>
                    <TableCell>
                      {customer.last_transaction_at ? new Date(customer.last_transaction_at).toLocaleString() : '—'}
                    </TableCell>
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
