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
import { resolveRoutingTypeLabel } from '@/lib/transactions/routing-type'
import { resolveCustomerDisplayName } from '@/lib/auth/customer-display'
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
  displayStatus?: string
  description: string
  metadata: Record<string, any>
  createdAt: string
  margin?: number
  marginCurrency?: string
  planName?: string
  routingType?: string
  rechargeSummary?: {
    planId: string
    planName: string
    planPrice: number
    planPriceCurrency: string
    serviceFee: number
    tax: number
    totalPayable: number
    paymentCurrency: string
    paymentMethod: string
  } | null
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

type TransactionsSummary = {
  total_orders: number
  completed_orders: number
  failed_orders: number
  pending_orders: number
  total_margin: number
  gross_revenue?: number
  refunds?: number
  provider_cost?: number
  itu_revenue?: number
  reporting_currency: string
}

type TransactionsPagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default function AdminTransactionsPage() {
  const user = useAuthStore((s) => s.user)
  const { displayProvider } = useProviderDisplay()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailModel, setDetailModel] = useState<TransactionDetailModel | null>(null)
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [summary, setSummary] = useState<TransactionsSummary>({
    total_orders: 0,
    completed_orders: 0,
    failed_orders: 0,
    pending_orders: 0,
    total_margin: 0,
    reporting_currency: 'EUR',
  })
  const [pagination, setPagination] = useState<TransactionsPagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  })
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundTransaction, setRefundTransaction] = useState<AdminTransaction | null>(null)
  const [refunding, setRefunding] = useState(false)
  const canRefund = !!(user && clientHasAdminPermission(user, 'customers.edit'))

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, dateFilter, debouncedSearch, pageSize])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (dateFilter !== 'all') params.set('date', dateFilter)
    if (debouncedSearch) params.set('search', debouncedSearch)

    setLoading(true)
    void fetch(`/api/admin/transactions?${params}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setTransactions(Array.isArray(data?.transactions) ? data.transactions : [])
        if (data?.summary) setSummary(data.summary)
        if (data?.pagination) setPagination(data.pagination)
      })
      .catch(() => {
        setTransactions([])
        setSummary({
          total_orders: 0,
          completed_orders: 0,
          failed_orders: 0,
          pending_orders: 0,
          total_margin: 0,
          reporting_currency: 'EUR',
        })
        setPagination({ page: 1, pageSize, total: 0, totalPages: 1 })
      })
      .finally(() => setLoading(false))
  }, [statusFilter, dateFilter, debouncedSearch, page, pageSize, refreshTrigger])

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
    if (order.planName) return order.planName
    if (order.type === 'topup') return 'Wallet Top-up'
    if (order.type === 'refund') return 'Wallet Refund'
    if (order.type === 'commission') return 'Commission Credit'
    return order.rechargeDetails?.productName && order.rechargeDetails.productName !== '—'
      ? order.rechargeDetails.productName
      : order.metadata?.productName || order.rechargeDetails?.skuCode || 'Recharge Plan'
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
    order.displayStatus ??
    resolveTransactionDisplayStatus({
      type: order.type,
      transactionStatus: order.status,
      rechargeOrderStatus: order.rechargeDetails?.status,
    })

  const getCustomerName = (order: AdminTransaction) => {
    return resolveCustomerDisplayName({
      profile: {
        name: order.user?.name,
        email: order.user?.email,
        phone: order.user?.phone,
        country: order.user?.country,
      },
      metadata: order.metadata,
      rechargePhone: order.rechargeDetails?.phoneNumber,
    })
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
    const summary = order.rechargeSummary
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
      planId: summary?.planId,
      planName: summary?.planName ?? getPlanName(order),
      planPrice: summary?.planPrice,
      planPriceCurrency: summary?.planPriceCurrency,
      serviceFee: summary?.serviceFee,
      tax: summary?.tax,
      totalPayable: summary?.totalPayable ?? order.amount,
      paymentCurrency: summary?.paymentCurrency ?? order.currency,
      paymentMethod: summary?.paymentMethod ?? String(metadata.payment_gateway ?? '—'),
      paymentStatus: (metadata.razorpay_payment_id || metadata.payment_order_id) ? 'completed' : order.status,
      paymentReferenceId: String(metadata.razorpay_payment_id ?? metadata.providerRef ?? order.id),
      gatewayResponse: String(metadata.gatewayResponse ?? ((metadata.razorpay_payment_id || metadata.payment_order_id || order.status === 'completed') ? 'Approved' : 'Pending')),
      providerUsed: getProviderName(order),
      routingType: order.routingType && order.routingType !== '—' ? order.routingType : resolveRoutingTypeLabel(metadata),
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

  const reportingCurrency = summary.reporting_currency || 'EUR'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recharges</h1>
          <p className="text-muted-foreground">Manage all recharge orders and delivery statuses</p>
        </div>
        {/* <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button> */}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Orders</CardDescription>
            <CardTitle className="text-2xl">{summary.total_orders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl text-green-600">{summary.completed_orders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ITU Revenue</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(summary.itu_revenue ?? summary.total_margin, reportingCurrency)}
            </CardTitle>
            <p className="text-xs text-muted-foreground pt-1">Gross − Refunds − Provider Cost</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-2xl text-red-600">{summary.failed_orders}</CardTitle>
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
                placeholder="Search by order, customer, plan, provider, phone, amount..."
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
                  <SelectItem value="year">This Year</SelectItem>
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
                  <TableHead>Date</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan & Provider</TableHead>
                  <TableHead>Destination Number</TableHead>
                  <TableHead>Amount Paid</TableHead>
                  <TableHead>Recharge Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading transactions...
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </TableCell>
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

          {pagination.total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40 mt-4">
              <div className="text-xs text-muted-foreground font-medium">
                Showing {Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)} to{' '}
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} transactions
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={pagination.page === 1 || loading}
                  >
                    Previous
                  </Button>

                  <span className="text-xs font-semibold px-2">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                    disabled={pagination.page >= pagination.totalPages || loading}
                  >
                    Next
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Rows per page:</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(val) => {
                      setPageSize(Number(val))
                      setPage(1)
                    }}
                    disabled={loading}
                  >
                    <SelectTrigger className="h-8 w-[70px] bg-background border-border/80 text-xs font-semibold">
                      <SelectValue placeholder={String(pageSize)} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
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
