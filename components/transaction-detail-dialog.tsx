'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, MessageSquarePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { TicketStatusBadge } from '@/components/ticket-status-badge'
import { apiAdminListTickets, apiCreateTicket, apiListTickets, type TicketUserHeaders } from '@/lib/tickets/client-api'
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
  customerCountry?: string
  destinationCountry?: string
  networkOperator?: string
  mobileNumber?: string
  paymentMethod?: string
  paymentStatus?: string
  paymentReferenceId?: string
  gatewayResponse?: string
  providerUsed?: string
  routingType?: string
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
  const [submitting, setSubmitting] = useState(false)
  const [description, setDescription] = useState('')

  const subject = useMemo(
    () => (transaction ? `Issue with Transaction #${transaction.id}` : ''),
    [transaction],
  )
  const normalizedStatus = (transaction?.status || '').toLowerCase()
  const canRaiseComplaint = useMemo(() => {
    if (!transaction) return false
    const createdAt = new Date(transaction.createdAt)
    if (Number.isNaN(createdAt.getTime())) return false
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    return Date.now() - createdAt.getTime() <= sevenDaysMs
  }, [transaction])

  useEffect(() => {
    if (!open || !transaction || !viewer) return

    let isMounted = true
    const currentTransaction = transaction
    const currentViewer = viewer
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
  }, [open, transaction, viewer, isAdmin])

  async function onRaiseTicket() {
    if (!viewer || !transaction) return
    const finalDescription = description.trim()
    if (!finalDescription) {
      toast.error('Please describe the issue before submitting')
      return
    }
    setSubmitting(true)
    try {
      await apiCreateTicket(viewer, {
        transactionId: transaction.id,
        transactionCreatedAt: transaction.createdAt,
        subject,
        description: finalDescription,
      })
      toast.success('Support ticket created')
      setDescription('')
      const list = isAdmin
        ? await apiAdminListTickets(viewer, { status: 'all', q: transaction.id })
        : await apiListTickets(viewer)
      setRelatedTickets(
        list.filter(
          (ticket) =>
            ticket.transactionId === transaction.id ||
            ticket.subject.toLowerCase().includes(transaction.id.toLowerCase()),
        ),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {!transaction ? null : (
          <>
            <DialogHeader>
              <DialogTitle>Transaction Details</DialogTitle>
              <DialogDescription>Complete transaction and payment details.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Basic Info</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Transaction ID:</span> <span className="font-mono">{transaction.id}</span></p>
                  <p><span className="text-muted-foreground">Date & Time:</span> {prettyDateTime(transaction.createdAt)}</p>
                  <p><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{transaction.status || '—'}</Badge></p>
                  <p><span className="text-muted-foreground">Amount:</span> {prettyMoney(transaction.amount, transaction.currency)}</p>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Customer Info</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Name:</span> {transaction.customerName || '—'}</p>
                  <p><span className="text-muted-foreground">Email:</span> {transaction.customerEmail || '—'}</p>
                  <p><span className="text-muted-foreground">Country:</span> {transaction.customerCountry || '—'}</p>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Recharge Details</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Destination Country:</span> {transaction.destinationCountry || '—'}</p>
                  <p><span className="text-muted-foreground">Network / Operator:</span> {transaction.networkOperator || '—'}</p>
                  <p><span className="text-muted-foreground">Mobile / Account:</span> {transaction.mobileNumber || '—'}</p>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Payment Details</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Payment Method:</span> {transaction.paymentMethod || '—'}</p>
                  <p><span className="text-muted-foreground">Payment Status:</span> {transaction.paymentStatus || transaction.status || '—'}</p>
                  <p><span className="text-muted-foreground">Reference ID:</span> <span className="font-mono">{transaction.paymentReferenceId || '—'}</span></p>
                  <p><span className="text-muted-foreground">Gateway Response:</span> {transaction.gatewayResponse || '—'}</p>
                </div>
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Routing Info</h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Provider Used:</span> {transaction.providerUsed || '—'}</p>
                  <p><span className="text-muted-foreground">Routing Type:</span> {transaction.routingType || '—'}</p>
                  <p><span className="text-muted-foreground">API Response Status:</span> {transaction.apiResponseStatus || '—'}</p>
                </div>
              </section>

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
                      <div key={ticket.id} className="flex items-center justify-between rounded border p-2 text-sm">
                        <div className="space-y-1">
                          <p className="font-medium">{ticket.subject}</p>
                          <p className="font-mono text-xs text-muted-foreground">{ticket.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <TicketStatusBadge status={ticket.status} />
                          <Button variant="outline" size="sm" asChild>
                            <Link href={isAdmin ? `/admin/support-tickets/${ticket.id}` : `/account/tickets/${ticket.id}`}>
                              View
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {!isAdmin && (
                <section className="rounded-lg border p-3">
                  <h3 className="mb-2 text-sm font-semibold">Raise Support Ticket (Refund flow)</h3>
                  {!canRaiseComplaint && (
                    <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      Complaints are allowed only within 1 week of transaction date. For this transaction, please use email or
                      the contact form.
                    </p>
                  )}
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label>Transaction ID</Label>
                      <Input value={transaction.id} disabled />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Subject</Label>
                      <Input value={subject} disabled />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Description</Label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe your issue and refund request."
                        rows={4}
                        disabled={!canRaiseComplaint}
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>

            {!isAdmin && (
              <DialogFooter>
                <Button onClick={() => void onRaiseTicket()} disabled={submitting || !canRaiseComplaint}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-2 h-4 w-4" />}
                  Raise Support Ticket
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
