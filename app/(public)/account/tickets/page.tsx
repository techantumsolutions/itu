'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MessageSquarePlus, Loader2, Eye } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TicketStatusBadge } from '@/components/ticket-status-badge'
import { apiListTickets } from '@/lib/tickets/client-api'
import type { Ticket } from '@/lib/tickets/types'
import { toast } from 'sonner'
import { CreateTicketDialog } from '@/components/create-ticket-dialog'

export default function AccountTicketsPage() {
  const user = useAuthStore((s) => s.user)
  const headers = useMemo(
    () =>
      user
        ? { id: user.id, email: user.email, name: user.name, role: user.role }
        : null,
    [user],
  )

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [urlTxId, setUrlTxId] = useState<string | null>(null)
  const [isLockedTxn, setIsLockedTxn] = useState(false)

  const load = useCallback(async () => {
    if (!headers) return
    setLoading(true)
    try {
      const list = await apiListTickets(headers)
      setTickets(list)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void load()
  }, [load])

  // Parse transaction parameter on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const txnId = params.get('txnId')
    if (txnId) {
      setUrlTxId(txnId)
      setIsLockedTxn(true)
      setOpen(true)
    }
  }, [])

  // Clear URL query parameter and unlock selection when dialog is closed
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setUrlTxId(null)
      setIsLockedTxn(false)
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('txnId')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }

  if (!headers) return null

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Support Tickets</h1>
          <p className="text-muted-foreground">Raise a complaint and track replies from our team.</p>
        </div>
        <Button 
          onClick={() => setOpen(true)}
          className="gap-2 self-start sm:self-auto rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 h-10 px-4 shadow-sm"
        >
          <MessageSquarePlus className="size-4" />
          Create New Ticket
        </Button>
        <CreateTicketDialog
          open={open}
          onOpenChange={handleOpenChange}
          preselectedTxId={urlTxId}
          lockTransaction={isLockedTxn}
          onSuccess={load}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-elevated-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-muted-foreground">
            No tickets yet. Create one to get help from support.
          </div>
        ) : (
          <Table className="table-auto w-full">
            <TableHeader className="bg-neutral-50/75 border-b border-neutral-200/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[120px] max-w-none whitespace-nowrap px-4 py-3.5 font-semibold text-neutral-900">
                  Ticket ID
                </TableHead>
                <TableHead className="w-[130px] max-w-none whitespace-nowrap px-4 py-3.5 font-semibold text-neutral-900">
                  Status
                </TableHead>
                {/* <TableHead className="w-[180px] max-w-none whitespace-nowrap px-4 py-3.5 font-semibold text-neutral-900">
                  Last Updated
                </TableHead> */}
                <TableHead className="w-[80px] max-w-none whitespace-nowrap px-4 py-3.5 text-right font-semibold text-neutral-900">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((t) => (
                <TableRow key={t.id} className="group hover:bg-neutral-50/50 transition-colors">
                  <TableCell className="max-w-none whitespace-nowrap px-4 py-4">
                    <span className="bg-neutral-100 border border-neutral-200/50 rounded-lg px-2.5 py-1 font-mono text-[11px] font-medium text-neutral-600">
                      {t.id.slice(0, 8)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-none whitespace-nowrap px-4 py-4">
                    <TicketStatusBadge status={t.status} />
                  </TableCell>
                  {/* <TableCell className="max-w-none whitespace-nowrap px-4 py-4 text-sm text-neutral-500 font-normal">
                    {format(new Date(t.updatedAt), 'MMM d, yyyy HH:mm')}
                  </TableCell> */}
                  <TableCell className="max-w-none whitespace-nowrap px-4 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl h-8 w-8 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
                      asChild
                    >
                      <Link href={`/account/tickets/${t.id}`}>
                        <Eye className="size-4" />
                        <span className="sr-only">View Ticket</span>
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
