'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { MessageSquarePlus, Loader2, Tag, MessageSquare, Clock, ShieldAlert, ArrowRight, Eye } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TicketStatusBadge } from '@/components/ticket-status-badge'
import { apiCreateTicket, apiListTickets } from '@/lib/tickets/client-api'
import type { Ticket } from '@/lib/tickets/types'
import { toast } from 'sonner'

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
  const [submitting, setSubmitting] = useState(false)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [attachmentName, setAttachmentName] = useState('')
  const [uploading, setUploading] = useState(false)

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

  useEffect(() => {
    if (open) {
      setSubject('')
      setDescription('')
      setAttachmentUrl('')
      setAttachmentName('')
    }
  }, [open])

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setAttachmentUrl('')
    setAttachmentName('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/tickets/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Upload failed')
      }
      setAttachmentUrl(data.url)
      setAttachmentName(file.name)
      toast.success('File uploaded successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file')
      e.target.value = ''
    } finally {
      setUploading(false)
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!headers) return
    setSubmitting(true)
    try {
      await apiCreateTicket(headers, { subject, description, attachmentUrl })
      toast.success('Ticket created')
      setOpen(false)
      setSubject('')
      setDescription('')
      setAttachmentUrl('')
      setAttachmentName('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setSubmitting(false)
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 self-start sm:self-auto rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 h-10 px-4 shadow-sm">
              <MessageSquarePlus className="size-4" />
              Create New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <form onSubmit={onCreate}>
              <DialogHeader>
                <DialogTitle>New support ticket</DialogTitle>
                <DialogDescription>
                  Describe your issue. Our team usually responds within one business day.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="ticket-subject">Subject</Label>
                  <Input
                    id="ticket-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Short summary"
                    required
                    maxLength={200}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ticket-desc">Description</Label>
                  <Textarea
                    id="ticket-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened? Include order or phone numbers if relevant."
                    required
                    rows={6}
                    className="resize-y min-h-[120px]"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ticket-file">Attachment (Optional)</Label>
                  <Input
                    id="ticket-file"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={onFileChange}
                    disabled={uploading || submitting}
                    className="cursor-pointer"
                  />
                  {uploading && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 animate-pulse">
                      <Loader2 className="size-3 animate-spin" /> Uploading file...
                    </p>
                  )}
                  {attachmentName && !uploading && (
                    <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      ✓ Ready: {attachmentName}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">Images (PNG, JPG, GIF, WEBP) and PDFs are supported.</p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                 <Button type="submit" disabled={submitting || uploading}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : 'Submit ticket'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
