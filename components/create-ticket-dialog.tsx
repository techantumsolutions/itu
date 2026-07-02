'use client'

import { useEffect, useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiCreateTicket } from '@/lib/tickets/client-api'
import { toast } from 'sonner'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedTxId?: string | null
  lockTransaction?: boolean
  onSuccess?: () => void
}

export function CreateTicketDialog({ open, onOpenChange, preselectedTxId, lockTransaction = false, onSuccess }: Props) {
  const user = useAuthStore((s) => s.user)
  const headers = useMemo(
    () =>
      user
        ? { id: user.id, email: user.email, name: user.name, role: user.role }
        : null,
    [user],
  )

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [attachmentName, setAttachmentName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [selectedTxId, setSelectedTxId] = useState('')

  useEffect(() => {
    if (open) {
      setSubject('')
      setDescription('')
      setAttachmentUrl('')
      setAttachmentName('')
      setSelectedTxId(preselectedTxId || '')
      setTransactions([])

      const loadTransactions = async () => {
        setLoadingTransactions(true)
        try {
          const res = await fetch('/api/profile/transactions', { cache: 'no-store' })
          if (res.ok) {
            const data = await res.json()
            if (data && Array.isArray(data.transactions)) {
              const sevenDaysAgo = new Date()
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
              let recent = data.transactions.filter((tx: any) => {
                const txDate = new Date(tx.createdAt)
                return txDate >= sevenDaysAgo
              })

              if (preselectedTxId) {
                if (!recent.some((tx: any) => tx.id === preselectedTxId)) {
                  const targetTx = data.transactions.find((tx: any) => tx.id === preselectedTxId)
                  if (targetTx) {
                    recent = [targetTx, ...recent]
                  } else {
                    recent = [
                      {
                        id: preselectedTxId,
                        description: `Transaction #${preselectedTxId}`,
                        amount: 0,
                        currency: 'USD',
                        createdAt: new Date().toISOString(),
                      },
                      ...recent,
                    ]
                  }
                }
              }

              setTransactions(recent)
            }
          }
        } catch (err) {
          console.error('Failed to load transactions for ticket:', err)
        } finally {
          setLoadingTransactions(false)
        }
      }
      void loadTransactions()
    }
  }, [open, preselectedTxId])

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
      const tx = selectedTxId && selectedTxId !== 'none' ? transactions.find((t) => t.id === selectedTxId) : null
      await apiCreateTicket(headers, {
        subject,
        description,
        attachmentUrl,
        transactionId: tx?.id || undefined,
        transactionCreatedAt: tx?.createdAt || undefined,
      })
      toast.success('Ticket created')
      onOpenChange(false)
      setSubject('')
      setDescription('')
      setAttachmentUrl('')
      setAttachmentName('')
      setSelectedTxId('')
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  if (!headers) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <div className="grid gap-2">
              <Label htmlFor="ticket-tx">Attach Recent Transaction {lockTransaction ? '' : '(Optional)'}</Label>
              {loadingTransactions ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="size-3 animate-spin" /> Loading transactions...
                </p>
              ) : transactions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No transactions found in the last 7 days.</p>
              ) : (
                <Select disabled={lockTransaction} value={selectedTxId} onValueChange={setSelectedTxId}>
                  <SelectTrigger id="ticket-tx" className={lockTransaction ? 'bg-muted cursor-not-allowed opacity-80' : ''}>
                    <SelectValue placeholder="Select a transaction" />
                  </SelectTrigger>
                  <SelectContent>
                    {!lockTransaction && <SelectItem value="none">None</SelectItem>}
                    {transactions.map((tx) => (
                      <SelectItem key={tx.id} value={tx.id}>
                        {tx.metadata?.carrierName || tx.description || tx.type} • {tx.amount.toFixed(2)} {tx.currency} ({tx.createdAt ? format(new Date(tx.createdAt), 'MMM d') : 'Recent'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-muted-foreground">
                {lockTransaction
                  ? 'This transaction is locked for this support ticket.'
                  : 'Only transactions made within the last 7 days can be attached.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || uploading}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : 'Submit ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
