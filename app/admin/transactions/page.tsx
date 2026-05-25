'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TransactionDetailDialog, type TransactionDetailModel } from '@/components/transaction-detail-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, Filter, Download, MoreHorizontal, Eye, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'

type AdminTransaction = {
  id: string
  userId: string
  type: string
  amount: number
  currency: string
  status: string
  description: string
  metadata: Record<string, any>
  createdAt: string
}

export default function AdminTransactionsPage() {
  const user = useAuthStore((s) => s.user)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailModel, setDetailModel] = useState<TransactionDetailModel | null>(null)
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])

  useEffect(() => {
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    void fetch(`/api/admin/transactions?${params}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setTransactions(Array.isArray(data?.transactions) ? data.transactions : []))
      .catch(() => setTransactions([]))
  }, [statusFilter])

  const filteredOrders = transactions.filter((order) => {
    const metadata = order.metadata ?? {}
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(metadata.phone_number ?? '').includes(searchQuery) ||
      String(metadata.operator ?? metadata.carrierName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      refunded: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    }
    return (
      <Badge variant="outline" className={styles[status] || ''}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const openTransactionDetail = (order: AdminTransaction) => {
    const metadata = order.metadata ?? {}
    setDetailModel({
      id: order.id,
      createdAt: order.createdAt,
      status: order.status as any,
      amount: order.amount,
      currency: order.currency,
      customerName: String(metadata.customerName ?? 'Unknown'),
      customerEmail: String(metadata.customerEmail ?? '—'),
      customerCountry: String(metadata.country ?? '—'),
      destinationCountry: String(metadata.countryName ?? metadata.country ?? '—'),
      networkOperator: String(metadata.operator ?? metadata.carrierName ?? '—'),
      mobileNumber: String(metadata.phone_number ?? metadata.phoneNumber ?? '—'),
      paymentMethod: String(metadata.payment_gateway ?? '—'),
      paymentStatus: order.status,
      paymentReferenceId: String(metadata.razorpay_payment_id ?? metadata.providerRef ?? order.id),
      gatewayResponse: String(metadata.gatewayResponse ?? (order.status === 'completed' ? 'Approved' : 'Pending')),
      providerUsed: String(metadata.provider ?? metadata.operator ?? '—'),
      routingType: String(metadata.routingType ?? '—'),
      apiResponseStatus: order.status === 'completed' ? 'SUCCESS' : order.status === 'failed' ? 'FAILED' : 'PENDING',
      errorMessage: typeof metadata.errorMessage === 'string' ? metadata.errorMessage : undefined,
      failureReason: String(metadata.errorMessage ?? (order.status === 'failed' ? 'Provider unavailable' : '')),
      retryAttempts: Number(metadata.retryAttempts ?? 0),
    })
    setDetailOpen(true)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount)
  }

  // Stats
  const totalOrders = transactions.length
  const completedOrders = transactions.filter(o => o.status === 'completed').length
  const totalRevenue = transactions
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.amount, 0)
  const failedOrders = transactions.filter(o => o.status === 'failed').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">Manage all recharge orders and transactions</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Orders</CardDescription>
            <CardTitle className="text-2xl">{totalOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl text-green-600">{completedOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalRevenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-2xl text-red-600">{failedOrders}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">{order.id.slice(0, 12)}...</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{String(order.metadata?.phone_number ?? order.metadata?.phoneNumber ?? '—')}</p>
                          <p className="text-xs text-muted-foreground">{String(order.metadata?.countryName ?? order.metadata?.country ?? '—')}</p>
                        </div>
                      </TableCell>
                      <TableCell>{String(order.metadata?.operator ?? order.metadata?.carrierName ?? '—')}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{formatCurrency(order.amount, order.currency)}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.description || order.type}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openTransactionDetail(order)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {order.status === 'failed' && (
                              <DropdownMenuItem>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Retry
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <TransactionDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        transaction={detailModel}
        viewer={user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null}
        isAdmin
      />
    </div>
  )
}
