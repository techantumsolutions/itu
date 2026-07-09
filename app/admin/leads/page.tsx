'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuthStore } from '@/lib/stores'
import { toast } from 'sonner'
import type { User } from '@/lib/types'
import { clientHasAdminPermission } from '@/lib/auth/client-features'
import { Eye, Trash2, Loader2, Calendar, User as UserIcon, Mail, Phone, Bookmark, MessageSquare, Filter } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'

function adminHeaders(user: User) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': user.id,
    'x-user-email': user.email,
    'x-user-name': user.name ?? 'Admin',
    'x-user-role': user.role,
  }
}

interface Lead {
  id: string
  name: string
  email: string
  subject: string
  phone: string | null
  message: string | null
  status: string
  created_at: string
}

export default function AdminLeadsPage() {
  const user = useAuthStore((s) => s.user)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)

  const canView = user && clientHasAdminPermission(user, 'customers.view')
  const canEdit = user && clientHasAdminPermission(user, 'customers.edit')
  const canDelete = user && clientHasAdminPermission(user, 'customers.delete')

  const loadLeads = useCallback(async () => {
    if (!user || !canView) return
    setLoading(true)
    try {
      const url = `/api/admin/leads?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}`
      const res = await fetch(url, {
        credentials: 'include',
        headers: adminHeaders(user),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch leads')
      setLeads(data.leads || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [canView, user, statusFilter, search])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    if (!user || !canEdit) {
      toast.error('You do not have permission to edit leads')
      return
    }
    setUpdatingStatusId(id)
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        credentials: 'include',
        headers: adminHeaders(user),
        body: JSON.stringify({ id, status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update status')
      toast.success('Lead status updated')
      setLeads((prev) =>
        prev.map((lead) => (lead.id === id ? { ...lead, status: newStatus } : lead))
      )
      if (selectedLead && selectedLead.id === id) {
        setSelectedLead((prev) => prev ? { ...prev, status: newStatus } : null)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setUpdatingStatusId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user || !canDelete) {
      toast.error('You do not have permission to delete leads')
      return
    }
    if (!confirm('Are you sure you want to delete this lead?')) return

    try {
      const res = await fetch(`/api/admin/leads?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: adminHeaders(user),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete lead')
      toast.success('Lead deleted successfully')
      setLeads((prev) => prev.filter((lead) => lead.id !== id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (!user || !canView) {
    return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">New</Badge>
      case 'contacted':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">Contacted</Badge>
      case 'ignored':
        return <Badge className="bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-100">Ignored</Badge>
      case 'closed':
        return <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50">Closed</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contact Leads</h1>
          <p className="text-muted-foreground text-sm">
            View and manage appointment booking requests submitted from the Contact Us form.
          </p>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="border border-border/80">
        <CardContent className="pt-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 space-y-1">
            <Input
              placeholder="Search by name, email, subject, message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="w-full md:w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="size-3.5" />
                  <SelectValue placeholder="Filter by status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card className="border border-border/80">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Loading leads...</p>
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-sm">No leads found matching your criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px] pl-6">Submitted Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact Information</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  {canEdit && <TableHead className="w-[160px]">Change Status</TableHead>}
                  <TableHead className="w-[100px] pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} className="hover:bg-muted/30">
                    <TableCell className="pl-6 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3.5" />
                        {new Date(lead.created_at).toLocaleDateString()} {new Date(lead.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-sm text-foreground">
                      {lead.name}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Mail className="size-3.5 text-muted-foreground/60" />
                        {lead.email}
                      </div>
                      {lead.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3.5 text-muted-foreground/60" />
                          {lead.phone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground max-w-[200px] truncate">
                      {lead.subject}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(lead.status)}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Select
                          disabled={updatingStatusId === lead.id}
                          value={lead.status}
                          onValueChange={(val) => handleUpdateStatus(lead.id, val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="ignored">Ignored</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell className="pr-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedLead(lead)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(lead.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={selectedLead !== null} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Bookmark className="size-5 text-primary" />
              Lead Details
            </DialogTitle>
            <DialogDescription>
              Submitted on {selectedLead && new Date(selectedLead.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4 py-3 text-sm">
              <div className="grid grid-cols-3 gap-2 border-b pb-3 border-border/40">
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <UserIcon className="size-4 text-muted-foreground/60" />
                  Name:
                </span>
                <span className="col-span-2 font-semibold text-foreground">{selectedLead.name}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 border-b pb-3 border-border/40">
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <Mail className="size-4 text-muted-foreground/60" />
                  Email:
                </span>
                <span className="col-span-2 font-medium text-foreground">{selectedLead.email}</span>
              </div>

              {selectedLead.phone && (
                <div className="grid grid-cols-3 gap-2 border-b pb-3 border-border/40">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Phone className="size-4 text-muted-foreground/60" />
                    Phone:
                  </span>
                  <span className="col-span-2 font-medium text-foreground">{selectedLead.phone}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 border-b pb-3 border-border/40">
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <Bookmark className="size-4 text-muted-foreground/60" />
                  Subject:
                </span>
                <span className="col-span-2 font-medium text-foreground">{selectedLead.subject}</span>
              </div>

              <div className="space-y-2 border-b pb-3 border-border/40">
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <MessageSquare className="size-4 text-muted-foreground/60" />
                  Message:
                </span>
                <div className="p-3.5 bg-muted/40 rounded-xl text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {selectedLead.message || 'No message content provided.'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-muted-foreground font-medium">Status:</span>
                <div className="col-span-2 flex items-center gap-3">
                  {getStatusBadge(selectedLead.status)}
                  {canEdit && (
                    <Select
                      value={selectedLead.status}
                      onValueChange={(val) => handleUpdateStatus(selectedLead.id, val)}
                    >
                      <SelectTrigger className="h-8 text-xs w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="ignored">Ignored</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
