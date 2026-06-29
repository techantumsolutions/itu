'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowLeft, Loader2, Send, StickyNote, RotateCw } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TicketStatusBadge } from '@/components/ticket-status-badge'
import { TicketThread } from '@/components/ticket-thread'
import {
  apiAdminAddNote,
  apiAdminGetTicket,
  apiAdminRespond,
  apiAdminSetStatus,
} from '@/lib/tickets/client-api'
import type { TicketAdminDetail, TicketStatus, TicketMessage } from '@/lib/tickets/types'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'
import { toast } from 'sonner'
import { io } from 'socket.io-client'
import { getPublicSocketServerUrl } from '@/lib/tickets/socket-config'

export default function AdminSupportTicketDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''
  const user = useAuthStore((s) => s.user)
  const headers = useMemo(
    () =>
      user
        ? { id: user.id, email: user.email, name: user.name, role: user.role }
        : null,
    [user],
  )

  const [data, setData] = useState<TicketAdminDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const [statusPick, setStatusPick] = useState<TicketStatus>('open')
  const [sending, setSending] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (user && !isClientAdminUser(user)) {
      toast.error('Admins only')
      router.replace('/account')
    }
  }, [user, router])

  const load = useCallback(async (isInitial = false) => {
    if (!headers || !id) return
    if (isInitial) setLoading(true)
    try {
      const t = await apiAdminGetTicket(headers, id)
      setData(t)
      setStatusPick(t.status)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load ticket')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [headers, id])

  const handleRefresh = async () => {
    if (!headers || !id) return
    setRefreshing(true)
    try {
      const t = await apiAdminGetTicket(headers, id)
      setData(t)
      setStatusPick(t.status)
      toast.success('Messages refreshed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to refresh messages')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load(true)
  }, [load])

  useEffect(() => {
    if (!id) return
    const socket = io(getPublicSocketServerUrl(), { autoConnect: true })

    socket.emit('join', id)

    socket.on('message', (newMessage: TicketMessage) => {
      setData((prev) => {
        if (!prev) return prev
        if (prev.messages.some((m) => m.id === newMessage.id)) return prev
        return {
          ...prev,
          messages: [...prev.messages, newMessage],
        }
      })
    })

    socket.on('status_update', (newStatus: TicketStatus) => {
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          status: newStatus,
        }
      })
      setStatusPick(newStatus)
    })

    return () => {
      socket.disconnect()
    }
  }, [id])

  async function onRespond(e: React.FormEvent) {
    e.preventDefault()
    if (!headers || !id || !reply.trim()) return
    setSending(true)
    try {
      await apiAdminRespond(headers, id, reply.trim())
      setReply('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  async function onSaveStatus() {
    if (!headers || !id) return
    setSavingStatus(true)
    try {
      await apiAdminSetStatus(headers, id, statusPick)
      toast.success('Status updated')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSavingStatus(false)
    }
  }

  async function onSaveNote(e: React.FormEvent) {
    e.preventDefault()
    if (!headers || !id || !note.trim()) return
    setSavingNote(true)
    try {
      await apiAdminAddNote(headers, id, note.trim())
      setNote('')
      toast.success('Internal note saved')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save note')
    } finally {
      setSavingNote(false)
    }
  }

  if (!headers) return null

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link href="/admin/support-tickets">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
        <p className="text-muted-foreground">Ticket not found.</p>
      </div>
    )
  }

  const canPublicReply = data.status !== 'resolved'

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" asChild className="w-fit gap-2 px-0 text-muted-foreground hover:text-foreground">
        <Link href="/admin/support-tickets">
          <ArrowLeft className="size-4" />
          Support Tickets
        </Link>
      </Button>

      <div className="flex flex-col gap-4 border-b border-border/60 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{data.id}</span>
            <TicketStatusBadge status={data.status} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{data.subject}</h1>
          <p className="text-sm text-muted-foreground">
            Created {format(new Date(data.createdAt), 'MMM d, yyyy HH:mm')} · Updated{' '}
            {format(new Date(data.updatedAt), 'MMM d, yyyy HH:mm')}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          {/* 1. Customer Information */}
          <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-elevated-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer</h2>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{data.userName || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{data.userEmail || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">User ID</dt>
                <dd className="font-mono text-xs">{data.userId}</dd>
              </div>
            </dl>
          </section>

          {/* 2. Linked Transaction */}
          <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-elevated-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Linked Transaction</h2>
            {!data.transactionId ? (
              <p className="text-sm text-muted-foreground">No transaction linked to this ticket.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Transaction ID</p>
                  <p className="font-mono text-xs">{data.transactionId}</p>
                </div>
                {data.transactionDetails ? (
                  <dl className="grid gap-2 border-t border-border/40 pt-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Operator Name</dt>
                      <dd className="font-medium">{data.transactionDetails.operatorName || data.transactionDetails.userName || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd className="font-medium">{data.transactionDetails.amount.toFixed(2)} {data.transactionDetails.currency}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="font-medium capitalize">{data.transactionDetails.status}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Description</dt>
                      <dd className="font-medium">{data.transactionDetails.description || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Date</dt>
                      <dd className="font-medium">{format(new Date(data.transactionDetails.createdAt), 'MMM d, yyyy HH:mm')}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">Loading transaction details...</p>
                )}
              </div>
            )}
          </section>

          {/* 3. Attachment (if exists) */}
          {data.attachmentUrl && (
            <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-elevated-sm space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Attachments</h2>
              {/\.(png|jpe?g|gif|webp)$/i.test(data.attachmentUrl) ? (
                <div className="max-w-sm rounded-lg overflow-hidden border border-border bg-muted/10 shadow-sm">
                  <a href={data.attachmentUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={data.attachmentUrl} alt="Attachment" className="max-h-48 w-auto object-contain hover:opacity-95 transition-opacity" />
                  </a>
                </div>
              ) : (
                <a
                  href={data.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 hover:underline bg-neutral-100 px-3 py-1.5 rounded-lg border border-neutral-200"
                >
                  <span>📎</span> Download / View File
                </a>
              )}
            </section>
          )}

          {/* 3. Original Query / Description */}
          <section className="rounded-2xl border border-orange-100 bg-orange-50/20 p-5 shadow-elevated-sm space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-orange-800">Original Description</h2>
            <p className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">{data.description}</p>
          </section>

          {/* 4. Thread (Conversation history) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Thread</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="h-8 gap-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <RotateCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                Refresh
              </Button>
            </div>
            <TicketThread
              description={data.description}
              messages={data.messages}
              variant="admin"
              ticketCreatedAt={data.createdAt}
            />
          </section>

          {/* 4. Reply to customer */}
          <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-elevated-sm">
            <h2 className="mb-3 text-sm font-semibold">Reply to customer</h2>
            {canPublicReply ? (
              <form onSubmit={onRespond} className="flex flex-col gap-3">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Your public reply…"
                  rows={4}
                  className="resize-y min-h-[100px]"
                />
                <Button type="submit" disabled={sending || !reply.trim()} className="w-fit gap-2">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send reply
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ticket is resolved — public replies are disabled. Re-open by setting status to Open or In progress, or use
                internal notes.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {/* Status Change Card */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-elevated-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Ticket Status</span>
              <TicketStatusBadge status={data.status} />
            </div>
            <Select value={statusPick} onValueChange={(v) => setStatusPick(v as TicketStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={() => void onSaveStatus()} disabled={savingStatus || statusPick === data.status}>
              {savingStatus ? <Loader2 className="size-4 animate-spin" /> : 'Save status'}
            </Button>
          </div>

          {/* Internal notes Card */}
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4  ">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 ">
              <StickyNote className="size-4" />
              Internal notes
            </div>
            <p className="mb-3 text-xs text-amber-900/80 ">Visible to admins only.</p>
            <ul className="mb-4 max-h-48 space-y-2 overflow-y-auto text-sm">
              {data.notes.length === 0 ? (
                <li className="text-muted-foreground">No notes yet.</li>
              ) : (
                data.notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-amber-200/50 bg-background/80 px-3 py-2 ">
                    <p className="whitespace-pre-wrap text-foreground">{n.note}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.createdBy} · {format(new Date(n.createdAt), 'MMM d, HH:mm')}
                    </p>
                  </li>
                ))
              )}
            </ul>
            <form onSubmit={onSaveNote} className="space-y-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add internal note…"
                rows={3}
                className="resize-y bg-background/90"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={savingNote || !note.trim()}>
                {savingNote ? <Loader2 className="size-4 animate-spin" /> : 'Save note'}
              </Button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}
