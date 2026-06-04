'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TicketStatusBadge } from '@/components/ticket-status-badge'
import { TicketThread } from '@/components/ticket-thread'
import { apiGetTicket, apiPostTicketMessage } from '@/lib/tickets/client-api'
import type { TicketWithThread } from '@/lib/tickets/types'
import { toast } from 'sonner'

export default function AccountTicketDetailPage() {
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

  const [data, setData] = useState<TicketWithThread | null>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    if (!headers || !id) return
    setLoading(true)
    try {
      const t = await apiGetTicket(headers, id)
      setData(t)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load ticket')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [headers, id])

  useEffect(() => {
    void load()
  }, [load])

  async function onSendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!headers || !id || !reply.trim()) return
    setSending(true)
    try {
      await apiPostTicketMessage(headers, id, reply.trim())
      setReply('')
      toast.success('Message sent')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
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
        <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground hover:text-foreground -ml-2.5">
          <Link href="/account/tickets">
            <ArrowLeft className="size-4" />
            Back to tickets
          </Link>
        </Button>
        <p className="text-muted-foreground">Ticket not found.</p>
      </div>
    )
  }

  const canReply = data.status !== 'resolved'

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-6">
        <Button variant="ghost" size="sm" asChild className="w-fit gap-2 text-muted-foreground hover:text-foreground -ml-2.5">
          <Link href="/account/tickets">
            <ArrowLeft className="size-4" />
            My Support Tickets
          </Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-medium px-2.5 py-0.5 bg-neutral-100 border border-neutral-200/50 rounded-lg text-neutral-600">
                Ticket ID: {data.id}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{data.subject}</h1>
            <p className="text-sm text-muted-foreground">
              Created {format(new Date(data.createdAt), 'MMM d, yyyy HH:mm')} · Updated{' '}
              {format(new Date(data.updatedAt), 'MMM d, yyyy HH:mm')}
            </p>
          </div>
          <TicketStatusBadge status={data.status} showHint />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conversation</h2>
        <TicketThread description={data.description} messages={data.messages} />
      </section>

      {canReply ? (
        <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-elevated-sm">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Reply to support</h2>
          <form onSubmit={onSendReply} className="flex flex-col gap-4">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your message…"
              rows={3}
              className="min-h-[100px] w-full resize-y rounded-xl border-border/70"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={sending || !reply.trim()} className="gap-2 rounded-xl px-5">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send Message
              </Button>
            </div>
          </form>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">This ticket is resolved. Open a new ticket if you need more help.</p>
      )}
    </div>
  )
}
