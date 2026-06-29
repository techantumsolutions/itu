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
import { Search, Filter, Download, MoreHorizontal, Eye, RefreshCw, RotateCcw } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import { clientHasAdminPermission } from '@/lib/auth/client-features'
import { useProviderDisplay } from '@/components/admin/provider-display-context'
import { toast } from 'sonner'
import { resolveTransactionDisplayStatus } from '@/lib/transactions/display-status'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  user?: {
    name: string
    email: string
    phone?: string
    country?: string
  }
  rechargeDetails?: {
    productName: string
    skuCode: string
    provider: string
    operatorName: string
    status: string
    phoneNumber?: string
  } | null
}

export default function AdminTransactionsPage() {
  const user = useAuthStore((s) => s.user)
  const { displayProvider } = useProviderDisplay()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailModel, setDetailModel] = useState<TransactionDetailModel | null>(null)
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundTransaction, setRefundTransaction] = useState<AdminTransaction | null>(null)
  const [refunding, setRefunding] = useState(false)
  const canRefund = !!(user && clientHasAdminPermission(user, 'customers.edit'))

  useEffect(() => {
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    void fetch(`/api/admin/transactions?${params}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setTransactions(Array.isArray(data?.transactions) ? data.transactions : []))
      .catch(() => setTransactions([]))
  }, [statusFilter, refreshTrigger])

  const handleRefundConfirm = async () => {
    if (!refundTransaction) return
    setRefunding(true)
    try {
      const res = await fetch('/api/admin/transactions/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: refundTransaction.id }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success('Refund credited to user wallet successfully!')
        setRefundDialogOpen(false)
        setRefreshTrigger((prev) => prev + 1)
      } else {
        toast.error(data.error || 'Failed to process refund')
      }
    } catch (e) {
      toast.error('Network error during refund processing')
    } finally {
      setRefunding(false)
    }
  }

  const getPlanName = (order: AdminTransaction) => {
    if (order.type === 'topup') return 'Wallet Top-up'
    if (order.type === 'refund') return 'Wallet Refund'
    if (order.type === 'commission') return 'Commission Credit'
    return order.rechargeDetails?.productName && order.rechargeDetails.productName !== '—'
      ? order.rechargeDetails.productName
      : order.metadata?.productName || order.rechargeDetails?.skuCode || order.metadata?.plan_id || 'Recharge Plan'
  }

  const getProviderName = (order: AdminTransaction) => {
    if (order.type !== 'recharge') return '—'
    
    // 1. Check recharge details provider (populated from DB/routing logs)
    let p = order.rechargeDetails?.provider
    if (p && p !== '—' && p !== 'null') {
      return displayProvider({ name: p, code: p })
    }
    
    // 2. Check metadata fields directly
    p = order.metadata?.provider_code || order.metadata?.provider_name || order.metadata?.provider
    if (p && p !== '—' && p !== 'null') {
      return displayProvider({ name: p, code: p })
    }
    
    // 3. Check LCR routing metadata
    const routing = order.metadata?.routing?.selected
    if (routing) {
      const label = displayProvider({
        name: routing.providerName,
        code: routing.providerCode,
        id: routing.providerId,
      })
      if (label !== '—') return label
    }
    
    return '—'
  }

  const getDisplayStatus = (order: AdminTransaction) =>
    resolveTransactionDisplayStatus({
      type: order.type,
      transactionStatus: order.status,
      rechargeOrderStatus: order.rechargeDetails?.status,
    })

  const getCustomerName = (order: AdminTransaction) => {
    const name = order.user?.name?.trim()
    if (name && name !== 'Unknown') return name
    const phone = order.user?.phone?.trim()
    if (phone && phone !== '—') return phone
    return 'Unknown'
  }

  const getCustomerEmail = (order: AdminTransaction) => {
    const email = order.user?.email?.trim()
    return email && email !== '—' ? email : '—'
  }

  const getCustomerPhone = (order: AdminTransaction) => {
    const phone = order.user?.phone?.trim()
    return phone && phone !== '—' ? phone : '—'
  }

  const getCustomerCountry = (order: AdminTransaction) => {
    const country = order.user?.country?.trim()
    if (country && country !== '—') return country
    return String(order.metadata?.countryName ?? order.metadata?.country ?? '—')
  }

  const getDestinationPhoneNumber = (order: AdminTransaction) => {
    return String(order.metadata?.phone_number ?? order.metadata?.phoneNumber ?? order.metadata?.mobile_number ?? order.rechargeDetails?.phoneNumber ?? '—')
  }

  const filteredOrders = transactions.filter((order) => {
    const metadata = order.metadata ?? {}
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getCustomerName(order).toLowerCase().includes(searchQuery.toLowerCase()) ||
      getCustomerEmail(order).toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(order.user?.phone ?? '').includes(searchQuery) ||
      String(metadata.phone_number ?? '').includes(searchQuery) ||
      String(metadata.operator ?? metadata.carrierName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-100 text-green-800  ',
      pending: 'bg-yellow-100 text-yellow-800  ',
      processing: 'bg-blue-100 text-blue-800  ',
      failed: 'bg-red-100 text-red-800  ',
      refunded: 'bg-gray-100 text-gray-800  ',
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
      status: getDisplayStatus(order) as any,
      amount: order.amount,
      currency: order.currency,
      customerName: getCustomerName(order),
      customerEmail: getCustomerEmail(order),
      customerPhone: getCustomerPhone(order),
      customerCountry: getCustomerCountry(order),
      destinationCountry: String(metadata.countryName ?? metadata.country ?? '—'),
      networkOperator: order.rechargeDetails?.operatorName || order.metadata?.operator_id || order.metadata?.operator || String(order.metadata?.carrierName ?? '—'),
      mobileNumber: getDestinationPhoneNumber(order),
      paymentMethod: String(metadata.payment_gateway ?? '—'),
      paymentStatus: (metadata.razorpay_payment_id || metadata.payment_order_id) ? 'completed' : order.status,
      paymentReferenceId: String(metadata.razorpay_payment_id ?? metadata.providerRef ?? order.id),
      gatewayResponse: String(metadata.gatewayResponse ?? ((metadata.razorpay_payment_id || metadata.payment_order_id || order.status === 'completed') ? 'Approved' : 'Pending')),
      providerUsed: getProviderName(order),
      routingType: String(metadata.routingType ?? '—'),
      apiResponseStatus: getDisplayStatus(order) === 'completed' ? 'SUCCESS' : getDisplayStatus(order) === 'failed' ? 'FAILED' : 'PENDING',
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
  const completedOrders = transactions.filter((o) => getDisplayStatus(o) === 'completed').length
  const totalRevenue = transactions
    .filter((o) => getDisplayStatus(o) === 'completed')
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
          <div className="min-w-0 overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan & Provider</TableHead>
                  <TableHead>Destination Number</TableHead>
                  <TableHead>Amount Paid</TableHead>
                  <TableHead>Recharge Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">
                        <span title={order.id}>{order.id.slice(0, 8)}...</span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-sm text-neutral-900">{getCustomerName(order)}</p>
                          <p className="text-xs text-muted-foreground">{getCustomerEmail(order)}</p>
                          {getCustomerPhone(order) !== '—' && getCustomerPhone(order) !== getCustomerName(order) && (
                            <p className="text-xs text-muted-foreground">{getCustomerPhone(order)}</p>
                          )}
                          {getCustomerCountry(order) !== '—' && (
                            <p className="text-[10px] uppercase tracking-wide text-neutral-400">{getCustomerCountry(order)}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-neutral-800">
                            {getPlanName(order)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getProviderName(order)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {getDestinationPhoneNumber(order)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.rechargeDetails?.operatorName || order.metadata?.operator_id || order.metadata?.operator || String(order.metadata?.carrierName ?? '—')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-bold text-neutral-950 text-sm">
                            {formatCurrency(order.amount, order.currency)}
                          </p>
                          <p className="text-[10px] uppercase font-semibold text-neutral-400">
                            {order.currency}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(getDisplayStatus(order))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
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
                            {order.status === 'failed' && canRefund ? (
                              <DropdownMenuItem>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Retry
                              </DropdownMenuItem>
                            ) : null}
                            {canRefund && order.type === 'recharge' && order.status === 'failed' ? (
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700"
                                onClick={() => {
                                  setRefundTransaction(order)
                                  setRefundDialogOpen(true)
                                }}
                              >
                                <RotateCcw className="mr-2 h-4 w-4 text-red-600" />
                                Refund Wallet
                              </DropdownMenuItem>
                            ) : null}
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

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Wallet Refund</DialogTitle>
            <DialogDescription>
              Are you sure you want to refund this failed recharge? The amount will be credited back to the user's wallet.
            </DialogDescription>
          </DialogHeader>
          {refundTransaction && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4 text-sm">
                <span className="font-semibold text-muted-foreground col-span-1">Customer:</span>
                <span className="col-span-3 font-medium text-neutral-900">
                  {getCustomerName(refundTransaction)} ({getCustomerEmail(refundTransaction) !== '—' ? getCustomerEmail(refundTransaction) : getCustomerPhone(refundTransaction)})
                </span>
              </div>
              <div className="grid grid-cols-4 items-center gap-4 text-sm">
                <span className="font-semibold text-muted-foreground col-span-1">Amount:</span>
                <span className="col-span-3 font-bold text-neutral-900">
                  {formatCurrency(refundTransaction.amount, refundTransaction.currency)} {refundTransaction.currency}
                </span>
              </div>
              <div className="grid grid-cols-4 items-center gap-4 text-sm">
                <span className="font-semibold text-muted-foreground col-span-1">Plan:</span>
                <span className="col-span-3 font-medium text-neutral-800">
                  {getPlanName(refundTransaction)}
                </span>
              </div>
              <div className="grid grid-cols-4 items-center gap-4 text-sm">
                <span className="font-semibold text-muted-foreground col-span-1">Provider:</span>
                <span className="col-span-3 font-medium text-neutral-800">
                  {getProviderName(refundTransaction)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRefundDialogOpen(false)}
              disabled={refunding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleRefundConfirm}
              disabled={refunding}
            >
              {refunding ? 'Refunding...' : 'Confirm Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
