'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Loader2, Search, Eye } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { TicketStatusBadge } from '@/components/ticket-status-badge'
import { apiAdminListTickets } from '@/lib/tickets/client-api'
import type { Ticket, TicketStatus } from '@/lib/tickets/types'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'
import { toast } from 'sonner'

export default function AdminSupportTicketsPage() {
  const router = useRouter()
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
  const [status, setStatus] = useState<'all' | TicketStatus>('all')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => {
    if (user && !isClientAdminUser(user)) {
      toast.error('Admins only')
      router.replace('/account')
    }
  }, [user, router])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    if (!headers) return
    setLoading(true)
    try {
      const list = await apiAdminListTickets(headers, { status, q: debouncedQ || undefined })
      setTickets(list)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [headers, status, debouncedQ])

  useEffect(() => {
    void load()
  }, [load])

  if (!headers) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
        <p className="text-muted-foreground">Review complaints, respond, and resolve customer issues.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by ticket ID, email, or subject…"
            className="pl-9"
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()} className="sm:shrink-0">
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-elevated-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-muted-foreground">No tickets match your filters.</div>
        ) : (
          <Table className="table-fixed w-full min-w-[900px]">
            <TableHeader className="bg-neutral-50/75 border-b border-neutral-200/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[150px] max-w-none whitespace-nowrap px-4 py-3.5 font-semibold text-neutral-900">
                  Ticket ID
                </TableHead>
                <TableHead className="w-[280px] max-w-none px-4 py-3.5 font-semibold text-neutral-900">
                  User
                </TableHead>
                <TableHead className="w-[140px] max-w-none whitespace-nowrap px-4 py-3.5 font-semibold text-neutral-900">
                  Status
                </TableHead>
                <TableHead className="w-[150px] max-w-none whitespace-nowrap px-4 py-3.5 font-semibold text-neutral-900">
                  Created
                </TableHead>
                <TableHead className="w-[150px] max-w-none whitespace-nowrap px-4 py-3.5 font-semibold text-neutral-900">
                  Updated
                </TableHead>
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
                  <TableCell className="max-w-[280px] px-4 py-4">
                    <div className="text-sm font-medium text-neutral-900 truncate">{t.userName || '—'}</div>
                    <div className="text-xs text-neutral-500 truncate">{t.userEmail || '—'}</div>
                  </TableCell>
                  <TableCell className="max-w-none whitespace-nowrap px-4 py-4">
                    <TicketStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="max-w-none whitespace-nowrap px-4 py-4 text-sm text-neutral-500 font-normal">
                    {format(new Date(t.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="max-w-none whitespace-nowrap px-4 py-4 text-sm text-neutral-500 font-normal">
                    {format(new Date(t.updatedAt), 'MMM d, yyyy HH:mm')}
                  </TableCell>
                  <TableCell className="max-w-none whitespace-nowrap px-4 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl h-8 w-8 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
                      asChild
                    >
                      <Link href={`/admin/support-tickets/${t.id}`}>
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
