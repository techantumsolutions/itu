'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TicketStatusBadge } from '@/components/ticket-status-badge'
import { apiAdminListTickets, apiListTickets, type TicketUserHeaders } from '@/lib/tickets/client-api'
import type { Ticket } from '@/lib/tickets/types'
import { toast } from 'sonner'

export type TransactionDetailModel = {
  id: string
  createdAt: string
  status: string
  amount: number
  currency: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  customerCountry?: string
  destinationCountry?: string
  networkOperator?: string
  mobileNumber?: string
  planId?: string
  planName?: string
  planPrice?: number
  planPriceCurrency?: string
  serviceFee?: number
  serviceFeeCurrency?: string
  platformFee?: number
  paymentGatewayFee?: number
  tax?: number
  taxCurrency?: string
  totalPayable?: number
  paymentCurrency?: string
  paymentMethod?: string
  paymentStatus?: string
  paymentReferenceId?: string
  gatewayResponse?: string
  providerUsed?: string
  providerCost?: number | null
  providerCostCurrency?: string | null
  routingType?: string
  fxRate?: number | null
  fxFromCurrency?: string | null
  fxToCurrency?: string | null
  totalInRechargeCurrency?: number | null
  apiResponseStatus?: string
  errorMessage?: string
  failureReason?: string
  retryAttempts?: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: TransactionDetailModel | null
  viewer: TicketUserHeaders | null
  isAdmin: boolean
}

function prettyDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function prettyMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(amount)
}

export function TransactionDetailDialog({ open, onOpenChange, transaction, viewer, isAdmin }: Props) {
  const [relatedTickets, setRelatedTickets] = useState<Ticket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)

  const normalizedStatus = (transaction?.status || '').toLowerCase()

  const viewerId = viewer?.id
  const viewerEmail = viewer?.email
  const viewerName = viewer?.name
  const viewerRole = viewer?.role

  useEffect(() => {
    if (!open || !transaction || !viewerId) return

    let isMounted = true
    const currentTransaction = transaction
    const currentViewer = {
      id: viewerId,
      email: viewerEmail || '',
      name: viewerName || '',
      role: viewerRole || '',
    }
    async function loadRelatedTickets() {
      setLoadingTickets(true)
      try {
        const list = isAdmin
          ? await apiAdminListTickets(currentViewer, { status: 'all', q: currentTransaction.id })
          : await apiListTickets(currentViewer)
        if (!isMounted) return
        const filtered = list.filter(
          (ticket) =>
            ticket.transactionId === currentTransaction.id ||
            ticket.subject.toLowerCase().includes(currentTransaction.id.toLowerCase()),
        )
        setRelatedTickets(filtered)
      } catch (error) {
        if (!isMounted) return
        toast.error(error instanceof Error ? error.message : 'Failed to load related tickets')
      } finally {
        if (isMounted) setLoadingTickets(false)
      }
    }

    void loadRelatedTickets()
    return () => {
      isMounted = false
    }
  }, [open, transaction, viewerId, viewerEmail, viewerName, viewerRole, isAdmin])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {!transaction ? null : (
          <>
            <DialogHeader>
              <DialogTitle>Recharge Details</DialogTitle>
              <DialogDescription>Order summary, payment, and routing details for this recharge.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Basic Info</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Transaction ID:</span> <span className="font-mono">{transaction.id}</span></p>
                  <p><span className="text-muted-foreground">Date & Time:</span> {prettyDateTime(transaction.createdAt)}</p>
                  <p><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{transaction.status || '—'}</Badge></p>
                  <p><span className="text-muted-foreground">Amount:</span> {prettyMoney(transaction.totalPayable ?? transaction.amount, transaction.paymentCurrency || transaction.currency)}</p>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Customer Info</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Name:</span> {transaction.customerName || '—'}</p>
                  <p><span className="text-muted-foreground">Email:</span> {transaction.customerEmail || '—'}</p>
                  <p><span className="text-muted-foreground">Phone:</span> {transaction.customerPhone || '—'}</p>
                  <p><span className="text-muted-foreground">Country:</span> {transaction.customerCountry || '—'}</p>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Order Details</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Destination Country:</span> {transaction.destinationCountry || '—'}</p>
                  <p><span className="text-muted-foreground">Network / Operator:</span> {transaction.networkOperator || '—'}</p>
                  <p><span className="text-muted-foreground">Mobile / Account:</span> {transaction.mobileNumber || '—'}</p>
                  <p><span className="text-muted-foreground">Plan ID:</span> <span className="font-mono text-xs">{transaction.planId || '—'}</span></p>
                  <p><span className="text-muted-foreground">Plan Name:</span> {transaction.planName || '—'}</p>
                  <p>
                    <span className="text-muted-foreground">Plan Price:</span>{' '}
                    {transaction.planPrice != null
                      ? prettyMoney(transaction.planPrice, transaction.planPriceCurrency || transaction.currency)
                      : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Platform Fee:</span>{' '}
                    {transaction.platformFee != null
                      ? prettyMoney(
                          transaction.platformFee,
                          transaction.serviceFeeCurrency || transaction.planPriceCurrency || transaction.currency,
                        )
                      : transaction.serviceFee != null &&
                          (transaction.paymentGatewayFee == null || transaction.paymentGatewayFee <= 0)
                        ? prettyMoney(
                            transaction.serviceFee,
                            transaction.serviceFeeCurrency || transaction.planPriceCurrency || transaction.currency,
                          )
                        : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Payment Gateway Fee:</span>{' '}
                    {transaction.paymentGatewayFee != null
                      ? prettyMoney(
                          transaction.paymentGatewayFee,
                          transaction.serviceFeeCurrency || transaction.planPriceCurrency || transaction.currency,
                        )
                      : '—'}
                  </p>
                  {(transaction.tax ?? 0) > 0 ? (
                    <p>
                      <span className="text-muted-foreground">Tax:</span>{' '}
                      {prettyMoney(
                        transaction.tax ?? 0,
                        transaction.taxCurrency || transaction.planPriceCurrency || transaction.currency,
                      )}
                    </p>
                  ) : null}
                  {transaction.totalInRechargeCurrency != null &&
                  transaction.planPriceCurrency &&
                  transaction.paymentCurrency &&
                  transaction.planPriceCurrency !== transaction.paymentCurrency ? (
                    <p>
                      <span className="text-muted-foreground">Total (recharge currency):</span>{' '}
                      {prettyMoney(transaction.totalInRechargeCurrency, transaction.planPriceCurrency)}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-muted-foreground">Total Payable:</span>{' '}
                    {transaction.totalPayable != null
                      ? prettyMoney(transaction.totalPayable, transaction.paymentCurrency || transaction.currency)
                      : prettyMoney(transaction.amount, transaction.currency)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Payment Currency:</span>{' '}
                    {transaction.paymentCurrency || transaction.currency || '—'}
                  </p>
                  {transaction.fxRate != null &&
                  transaction.fxFromCurrency &&
                  transaction.fxToCurrency &&
                  transaction.fxFromCurrency !== transaction.fxToCurrency ? (
                    <p>
                      <span className="text-muted-foreground">FX Rate (at recharge):</span>{' '}
                      1 {transaction.fxFromCurrency} = {transaction.fxRate.toFixed(6)} {transaction.fxToCurrency}
                    </p>
                  ) : null}
                  <p><span className="text-muted-foreground">Payment Method:</span> {transaction.paymentMethod || '—'}</p>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Payment Details</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Payment Method:</span> {transaction.paymentMethod || '—'}</p>
                  <p><span className="text-muted-foreground">Paid Currency:</span> {transaction.paymentCurrency || transaction.currency || '—'}</p>
                  <p><span className="text-muted-foreground">Payment Status:</span> {transaction.paymentStatus || transaction.status || '—'}</p>
                  <p><span className="text-muted-foreground">Reference ID:</span> <span className="font-mono">{transaction.paymentReferenceId || '—'}</span></p>
                  <p><span className="text-muted-foreground">Gateway Response:</span> {transaction.gatewayResponse || '—'}</p>
                </div>
              </section>

              {isAdmin && (
                <section className="rounded-lg border p-3">
                  <h3 className="mb-2 text-sm font-semibold">Routing Details</h3>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p><span className="text-muted-foreground">Provider Used:</span> {transaction.providerUsed || '—'}</p>
                    <p><span className="text-muted-foreground">Routing Type:</span> {transaction.routingType || '—'}</p>
                    <p>
                      <span className="text-muted-foreground">Provider Cost:</span>{' '}
                      {transaction.providerCost != null && transaction.providerCost > 0
                        ? prettyMoney(
                            transaction.providerCost,
                            transaction.providerCostCurrency || transaction.currency,
                          )
                        : '—'}
                    </p>
                    <p><span className="text-muted-foreground">API Response Status:</span> {transaction.apiResponseStatus || '—'}</p>
                  </div>
                </section>
              )}

              {(normalizedStatus.includes('failed') || transaction.failureReason || transaction.errorMessage) && (
                <section className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-red-700">Failure Details</h3>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p><span className="text-muted-foreground">Error Message:</span> {transaction.errorMessage || '—'}</p>
                    <p><span className="text-muted-foreground">Failure Reason:</span> {transaction.failureReason || '—'}</p>
                    <p><span className="text-muted-foreground">Retry Attempts:</span> {transaction.retryAttempts ?? 0}</p>
                  </div>
                </section>
              )}

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Related Tickets</h3>
                {loadingTickets ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading related tickets...
                  </div>
                ) : relatedTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No related tickets found.</p>
                ) : (
                  <div className="space-y-2">
                    {relatedTickets.map((ticket) => (
                      <Link
                        key={ticket.id}
                        href={isAdmin ? `/admin/support-tickets/${ticket.id}` : `/account/tickets/${ticket.id}`}
                        onClick={() => onOpenChange(false)}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-neutral-50 transition-colors cursor-pointer"
                      >
                        <div className="space-y-1">
                          <p className="font-medium text-neutral-900">{ticket.subject}</p>
                          <p className="font-mono text-xs text-muted-foreground">{ticket.id}</p>
                        </div>
                        <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                          <TicketStatusBadge status={ticket.status} />
                          <Button variant="outline" size="sm" asChild>
                            <span>View</span>
                          </Button>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
