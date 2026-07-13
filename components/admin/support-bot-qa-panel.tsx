'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  SUPPORT_BOT_CATEGORIES,
  type SupportBotCategory,
  type SupportBotQa,
} from '@/lib/support-bot/qa'

type FormState = {
  id?: string
  question: string
  answer: string
  keywords: string
  category: SupportBotCategory
  isSuggested: boolean
  isActive: boolean
  sortOrder: number
}

const emptyForm = (): FormState => ({
  question: '',
  answer: '',
  keywords: '',
  category: 'general',
  isSuggested: false,
  isActive: true,
  sortOrder: 0,
})

export function SupportBotQaPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<SupportBotQa[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings/support-bot', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to load support bot Q&A')
        return
      }
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      toast.error('Failed to load support bot Q&A')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (item: SupportBotQa) => {
    setForm({
      id: item.id,
      question: item.question,
      answer: item.answer,
      keywords: item.keywords.join(', '),
      category: item.category,
      isSuggested: item.isSuggested,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit settings.')
      return
    }
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error('Question and answer are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        id: form.id,
        question: form.question.trim(),
        answer: form.answer.trim(),
        keywords: form.keywords,
        category: form.category,
        isSuggested: form.isSuggested,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      }
      const res = await fetch('/api/admin/settings/support-bot', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to save')
        return
      }
      toast.success(form.id ? 'Q&A updated' : 'Q&A created')
      setDialogOpen(false)
      await load()
    } catch {
      toast.error('Failed to save Q&A')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!canEdit) return
    if (!confirm('Delete this Q&A entry?')) return
    try {
      const res = await fetch(`/api/admin/settings/support-bot?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to delete')
        return
      }
      toast.success('Q&A deleted')
      await load()
    } catch {
      toast.error('Failed to delete Q&A')
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquareText className="h-5 w-5" />
              Support Bot Q&amp;A
            </CardTitle>
            <CardDescription className="mt-1.5 max-w-2xl">
              Answers used by the ticket assistant. Suggested questions appear when customers open a
              support ticket. Matching replies can also be posted automatically on new tickets.
            </CardDescription>
          </div>
          {canEdit && (
            <Button type="button" size="sm" onClick={openCreate} className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              Add Q&amp;A
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No Q&amp;A entries yet. Add questions customers often ask about transactions, payments,
              and recharges.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="w-[100px]">Order</TableHead>
                    {canEdit && <TableHead className="w-[100px] text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className={!item.isActive ? 'opacity-50' : undefined}>
                      <TableCell>
                        <div className="font-medium line-clamp-2 max-w-md">{item.question}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {item.answer}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.isSuggested && (
                            <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                              Suggested
                            </Badge>
                          )}
                          {!item.isActive && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{item.sortOrder}</TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(item)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleDelete(item.id)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Q&A' : 'Add Q&A'}</DialogTitle>
            <DialogDescription>
              Keywords help the bot match customer messages (comma-separated).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bot-q">Question</Label>
              <Input
                id="bot-q"
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                placeholder="Why is my recharge still pending?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-a">Answer</Label>
              <Textarea
                id="bot-a"
                value={form.answer}
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                rows={5}
                placeholder="Explain the resolution steps clearly…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-kw">Keywords</Label>
              <Input
                id="bot-kw"
                value={form.keywords}
                onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                placeholder="pending, recharge, status"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as SupportBotCategory }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_BOT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bot-order">Sort order</Label>
                <Input
                  id="bot-order"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Show as suggested question</p>
                <p className="text-xs text-muted-foreground">
                  Appears as a quick chip when opening a ticket
                </p>
              </div>
              <Switch
                checked={form.isSuggested}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isSuggested: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive entries are not used by the bot</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || !canEdit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
