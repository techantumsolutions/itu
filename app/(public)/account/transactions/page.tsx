'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { TransactionDetailDialog, type TransactionDetailModel } from '@/components/transaction-detail-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWalletStore } from '@/lib/stores'
import { isHiddenUserTransaction } from '@/lib/transactions/display-status'
import {
  Search,
  Download,
  MoreVertical,
  RotateCcw,
  Eye,
  MessageSquarePlus,
  UserPlus,
  Repeat,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores'
import { toast } from 'sonner'
import { getCountryName, getFlagEmoji } from '@/lib/country-codes'

type RecurringSchedule = {
  id: string
  transactionId: string
  planName: string
  mobileNumber: string
  country: string
  operator: string
  frequency: 'monthly' | 'custom'
  customIntervalDays?: number
  paymentMethod: string
  paymentAuthorizedAt: string
  nextRunAt: string
  isActive: boolean
}

const RECURRING_STORAGE_KEY = 'itu-recurring-schedules'
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

export default function TransactionsPage() {
  const { transactions, fetchTransactions } = useWalletStore()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    void fetchTransactions()
  }, [fetchTransactions])
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailModel, setDetailModel] = useState<TransactionDetailModel | null>(null)
  const [savedContacts, setSavedContacts] = useState<string[]>([])
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([])
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [recurringTxnId, setRecurringTxnId] = useState<string | null>(null)
  const [recurringFrequency, setRecurringFrequency] = useState<'monthly' | 'custom'>('monthly')
  const [customIntervalDays, setCustomIntervalDays] = useState('30')
  const [paymentAuthorized, setPaymentAuthorized] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(10)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const rawContacts = window.localStorage.getItem('itu-saved-contacts')
      const rawSchedules = window.localStorage.getItem(RECURRING_STORAGE_KEY)
      if (rawContacts) {
        const parsed = JSON.parse(rawContacts)
        if (Array.isArray(parsed)) setSavedContacts(parsed.filter((x) => typeof x === 'string'))
      }
      if (rawSchedules) {
        const parsed = JSON.parse(rawSchedules)
        if (Array.isArray(parsed)) setSchedules(parsed as RecurringSchedule[])
      }
    } catch {
      // ignore localStorage parsing issues
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('itu-saved-contacts', JSON.stringify(savedContacts))
  }, [savedContacts])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(schedules))
  }, [schedules])

  // Filter transactions
  const filteredTransactions = useMemo(() => transactions.filter((txn) => {
    if (isHiddenUserTransaction({
      type: txn.type,
      status: txn.status,
      description: txn.description,
      metadata: txn.metadata as Record<string, unknown> | null,
    })) {
      return false
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch =
        txn.description.toLowerCase().includes(query) ||
        txn.id.toLowerCase().includes(query) ||
        txn.metadata?.phoneNumber?.includes(query) ||
        txn.metadata?.mobile_number?.includes(query) ||
        txn.metadata?.carrierName?.toLowerCase().includes(query) ||
        txn.metadata?.operator_id?.toLowerCase().includes(query)
      if (!matchesSearch) return false
    }

    // Type filter
    if (typeFilter !== 'all' && txn.type !== typeFilter) return false

    // Status filter
    if (statusFilter !== 'all' && txn.status !== statusFilter) return false

    return true
  }), [transactions, searchQuery, typeFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize))

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredTransactions.slice(start, start + pageSize)
  }, [filteredTransactions, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, typeFilter, statusFilter, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200   ">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        )
      case 'pending':
      case 'processing':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200   ">
            <Clock className="mr-1 h-3 w-3" />
            {status === 'pending' ? 'Pending' : 'Processing'}
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200   ">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'topup':
      case 'refund':
        return <ArrowDownRight className="h-4 w-4 text-emerald-600" />
      case 'recharge':
      case 'payment':
        return <ArrowUpRight className="h-4 w-4 text-primary" />
      default:
        return null
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const openTransactionDetail = (txn: (typeof transactions)[number]) => {
    const routingType = txn.metadata?.carrier ? 'Cheapest' : '—'

    let destinationCountry = txn.metadata?.countryName || txn.metadata?.country || txn.metadata?.country_id || '—'
    if (typeof destinationCountry === 'string' && destinationCountry.length === 2) {
      destinationCountry = `${getFlagEmoji(destinationCountry)} ${getCountryName(destinationCountry)}`
    }

    const networkOperator = txn.metadata?.carrierName || txn.metadata?.carrier || txn.metadata?.operator_id || '—'
    const normalizedStatus = txn.status === 'completed' ? 'success' : txn.status === 'failed' ? 'failed' : 'pending'
    setDetailModel({
      id: txn.id,
      createdAt: txn.createdAt,
      status: txn.status,
      amount: txn.amount,
      currency: txn.currency === 'PTS' ? 'USD' : txn.currency,
      customerName: user?.name || '—',
      customerEmail: user?.email || '—',
      customerCountry: user?.countryCode || '—',
      destinationCountry,
      networkOperator,
      mobileNumber: txn.metadata?.mobile_number || txn.metadata?.phoneNumber || '—',
      paymentMethod: (txn.metadata as any)?.razorpay_payment_id && (txn.metadata as any).razorpay_payment_id !== 'wallet' ? 'Card' : 'Wallet',
      paymentStatus: ((txn.metadata as any)?.razorpay_payment_id || (txn.metadata as any)?.payment_order_id) ? 'completed' : txn.status,
      paymentReferenceId: (txn.metadata as any)?.razorpay_payment_id || txn.metadata?.providerRef || txn.metadata?.orderId || txn.id,
      gatewayResponse: ((txn.metadata as any)?.razorpay_payment_id || (txn.metadata as any)?.payment_order_id) ? 'Approved' : (txn.status === 'failed' ? txn.description : 'Approved'),
      providerUsed: networkOperator,
      routingType,
      apiResponseStatus: normalizedStatus.toUpperCase(),
      errorMessage: txn.status === 'failed' ? txn.description : undefined,
      failureReason: txn.status === 'failed' ? txn.description : undefined,
      retryAttempts: txn.status === 'failed' ? 1 : 0,
    })
    setDetailOpen(true)
  }

  const saveAsContact = (phone?: string) => {
    if (!phone) {
      toast.error('No mobile number available')
      return
    }
    if (savedContacts.includes(phone)) {
      toast.message('Number already saved')
      return
    }
    setSavedContacts((prev) => [phone, ...prev])
    toast.success('Number saved as contact')
  }

  const openRecurringSetup = (txnId: string) => {
    if (!user) {
      toast.error('Please sign in to set recurring recharge')
      return
    }
    setRecurringTxnId(txnId)
    setRecurringFrequency('monthly')
    setCustomIntervalDays('30')
    setPaymentAuthorized(false)
    setRecurringOpen(true)
  }

  const createRecurringSchedule = () => {
    if (!recurringTxnId) return
    if (!paymentAuthorized) {
      toast.error('Payment authorization is required')
      return
    }
    const txn = transactions.find((x) => x.id === recurringTxnId)
    if (!txn) {
      toast.error('Transaction not found')
      return
    }
    const intervalDays = recurringFrequency === 'monthly'
      ? 30
      : Math.max(1, Number(customIntervalDays) || 1)
    const nextRun = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString()

    const schedule: RecurringSchedule = {
      id: `rec-${Date.now()}`,
      transactionId: txn.id,
      planName: txn.metadata?.productName || txn.description,
      mobileNumber: txn.metadata?.mobile_number || txn.metadata?.phoneNumber || '—',
      country: (() => {
        const countryId = txn.metadata?.country_id || txn.metadata?.country || txn.metadata?.countryName;
        if (!countryId) return '—';
        if (typeof countryId === 'string' && countryId.length === 2) {
          return `${getFlagEmoji(countryId)} ${getCountryName(countryId)}`;
        }
        return countryId;
      })(),
      operator: txn.metadata?.carrierName || txn.metadata?.carrier || txn.metadata?.operator_id || '—',
      frequency: recurringFrequency,
      customIntervalDays: recurringFrequency === 'custom' ? intervalDays : undefined,
      paymentMethod: txn.type === 'topup' ? 'Card/Wallet' : 'Wallet',
      paymentAuthorizedAt: new Date().toISOString(),
      nextRunAt: nextRun,
      isActive: true,
    }
    setSchedules((prev) => [schedule, ...prev])
    setRecurringOpen(false)
    toast.success('Auto Recharge enabled and schedule created')
  }

  const toggleSchedule = (id: string) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)),
    )
  }

  const removeSchedule = (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id))
  }

  const recurringTxn = recurringTxnId ? transactions.find((x) => x.id === recurringTxnId) : null

  const handleExport = () => {
    if (filteredTransactions.length === 0) {
      toast.error('No transactions to export')
      return
    }

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return ''
      const stringVal = String(val)
      const escaped = stringVal.replace(/"/g, '""')
      if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
        return `"${escaped}"`
      }
      return escaped
    }

    const headers = [
      'Transaction ID',
      'Date & Time',
      'Type',
      'Description',
      'Mobile Number',
      'Country',
      'Operator',
      'Amount',
      'Currency',
      'Status',
      'Reward Points'
    ]

    const rows = filteredTransactions.map((txn) => {
      const countryId = txn.metadata?.country_id || txn.metadata?.country || txn.metadata?.countryName || ''
      const countryName = (typeof countryId === 'string' && countryId.length === 2)
        ? getCountryName(countryId)
        : countryId

      return [
        txn.id,
        `${formatDate(txn.createdAt)} ${formatTime(txn.createdAt)}`,
        txn.type,
        txn.description,
        txn.metadata?.mobile_number || txn.metadata?.phoneNumber || '—',
        countryName || '—',
        txn.metadata?.carrierName || txn.metadata?.carrier || txn.metadata?.operator_id || '—',
        txn.currency === 'PTS' ? `${txn.amount} pts` : `$${txn.amount.toFixed(2)}`,
        txn.currency,
        txn.status,
        txn.rewardPoints ? `+${txn.rewardPoints} pts` : '—'
      ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(escapeCSV).join(','))
    ].join('\n')

    try {
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `transaction_history_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Transaction history exported successfully')
    } catch (e) {
      toast.error('Failed to export transaction history')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Transaction History</h1>
          <p className="text-muted-foreground">View all your past transactions</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone, carrier, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="recharge">Recharge</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="topup">Wallet Top-up</SelectItem>
                <SelectItem value="refund">Refund</SelectItem>
                <SelectItem value="points_earned">Points Earned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Mobile Number</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Recharge Amount</TableHead>
                  <TableHead>Status</TableHead>

                  <TableHead>Reward Points</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTransactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell>
                        <p className="text-sm">{formatDate(txn.createdAt)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(txn.createdAt)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                            {getTypeIcon(txn.type)}
                          </div>
                          <div>
                            <p className="font-medium">{txn.metadata?.mobile_number || txn.metadata?.phoneNumber || '—'}</p>
                            {/* <p className="text-xs text-muted-foreground font-mono">{txn.id}</p> */}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const countryId = txn.metadata?.country_id || txn.metadata?.country || txn.metadata?.countryName;
                          if (!countryId) return '—';
                          if (typeof countryId === 'string' && countryId.length === 2) {
                            const name = getCountryName(countryId);
                            const flag = getFlagEmoji(countryId);
                            return `${flag} ${name}`;
                          }
                          return countryId;
                        })()}
                      </TableCell>
                      <TableCell>{txn.metadata?.carrierName || txn.metadata?.carrier || txn.metadata?.operator_id || '—'}</TableCell>
                      <TableCell className="font-semibold">
                        {txn.currency === 'PTS' ? `${txn.amount} pts` : `${txn.amount.toFixed(2)}`}
                      </TableCell>
                      <TableCell>{getStatusBadge(txn.status)}</TableCell>

                      <TableCell>
                        {user ? (
                          <span className={cn('text-sm font-medium', txn.rewardPoints ? 'text-primary' : 'text-muted-foreground')}>
                            {txn.rewardPoints ? `+${txn.rewardPoints} pts` : '—'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openTransactionDetail(txn)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {txn.type === 'recharge' && txn.status === 'completed' && (
                              <DropdownMenuItem asChild>
                                <Link href="/">
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Send Again
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {txn.type === 'recharge' && (
                              <DropdownMenuItem onClick={() => saveAsContact(txn.metadata?.mobile_number || txn.metadata?.phoneNumber)}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Save Number as Contact
                              </DropdownMenuItem>
                            )}
                            {txn.type === 'recharge' && (
                              <DropdownMenuItem onClick={() => openRecurringSetup(txn.id)}>
                                <Repeat className="mr-2 h-4 w-4" />
                                Enable Auto Recharge
                              </DropdownMenuItem>
                            )}
                            {txn.type === 'recharge' && (
                              <DropdownMenuItem onClick={() => openTransactionDetail(txn)}>
                                <MessageSquarePlus className="mr-2 h-4 w-4" />
                                Raise Complaint
                              </DropdownMenuItem>
                            )}
                            {txn.rechargeOrderId ? (
                              <DropdownMenuItem asChild>
                                <a
                                  href={`/api/receipt/${txn.rechargeOrderId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Download Receipt
                                </a>
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem disabled>
                                <Download className="mr-2 h-4 w-4" />
                                Download Receipt
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
          {filteredTransactions.length > 0 && (
            <div className="flex flex-col gap-4 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Showing {Math.min((currentPage - 1) * pageSize + 1, filteredTransactions.length)} to{' '}
                {Math.min(currentPage * pageSize, filteredTransactions.length)} of {filteredTransactions.length}{' '}
                transactions
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="px-2 text-xs font-semibold">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
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
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="h-8 w-[72px] text-xs">
                      <SelectValue placeholder={String(pageSize)} />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recurring Recharge</CardTitle>
          <CardDescription>Automate recharges securely for registered users only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Payment authorization validity, card expiry and insufficient funds are handled by payment gateway rules.
            If auto-payment fails, the system sends an email asking user to update payment method.
          </p>
          <div className="rounded-md border w-full overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No recurring schedules yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  schedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.planName}</TableCell>
                      <TableCell>{s.mobileNumber}</TableCell>
                      <TableCell>{s.frequency === 'monthly' ? 'Monthly' : `Every ${s.customIntervalDays} days`}</TableCell>
                      <TableCell>{formatDate(s.nextRunAt)} {formatTime(s.nextRunAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.isActive ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'}>
                          {s.isActive ? 'Active' : 'Paused'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => toggleSchedule(s.id)}>
                            {s.isActive ? 'Pause' : 'Resume'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => removeSchedule(s.id)}>
                            Remove
                          </Button>
                        </div>
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
        isAdmin={false}
      />

      <Dialog open={recurringOpen} onOpenChange={setRecurringOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enable Auto Recharge</DialogTitle>
            <DialogDescription>
              Configure schedule and authorize recurring payments.
            </DialogDescription>
          </DialogHeader>
          {recurringTxn ? (
            <div className="grid gap-3 py-2">
              <div className="grid gap-1">
                <Label>Recharge Plan</Label>
                <Input value={recurringTxn.metadata?.productName || recurringTxn.description} disabled />
              </div>
              <div className="grid gap-1">
                <Label>Frequency</Label>
                <Select value={recurringFrequency} onValueChange={(v) => setRecurringFrequency(v as 'monthly' | 'custom')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Custom interval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {recurringFrequency === 'custom' && (
                <div className="grid gap-1">
                  <Label>Custom interval (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={customIntervalDays}
                    onChange={(e) => setCustomIntervalDays(e.target.value)}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={paymentAuthorized}
                  onChange={(e) => setPaymentAuthorized(e.target.checked)}
                />
                I authorize recurring payment for this recharge schedule.
              </label>
              <p className="text-xs text-muted-foreground">
                If payment fails due to card expiry or insufficient funds, we will email you to update payment method.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecurringOpen(false)}>Cancel</Button>
            <Button onClick={createRecurringSchedule}>Schedule Auto Recharge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
