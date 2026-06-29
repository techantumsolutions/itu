'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash, Plus, Pencil, Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { useAdminModulePermissions } from '@/lib/hooks/use-admin-module-permissions'

const PLACEMENTS = [
  { value: 'global_popup', label: 'Global Popup (All Pages)', pages: ['global'] },
  { value: 'global_scroll', label: 'Global Scroll Sticky (All Pages)', pages: ['global'] },
  { value: 'home_hero', label: 'Home Page Hero Banner', pages: ['/'] },
  { value: 'topup_sidebar', label: 'Top-up Page Sidebar', pages: ['/topup'] },
  { value: 'account_dashboard', label: 'Account Dashboard Banner', pages: ['/account'] },
]

export function CreativesTab() {
  const { canCreate, canEdit, canDelete } = useAdminModulePermissions('ads')
  const showActionsCol = canEdit || canDelete
  const tableColSpan = showActionsCol ? 6 : 5
  const [creatives, setCreatives] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  
  const [formData, setFormData] = useState<any>({
    campaign_id: '',
    format: 'banner',
    placement_key: '',
    title: '',
    description: '',
    media_url: '',
    destination_url: '',
    is_active: true,
    display_delay_seconds: 0,
    display_duration_seconds: 0,
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [crRes, caRes] = await Promise.all([
        fetch('/api/admin/ads/creatives'),
        fetch('/api/admin/ads/campaigns')
      ])
      const [crData, caData] = await Promise.all([crRes.json(), caRes.json()])
      setCreatives(crData.creatives || [])
      setCampaigns(caData.campaigns || [])
    } catch (e) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const data = new FormData()
    data.append('file', file)

    try {
      const res = await fetch('/api/admin/ads/upload', {
        method: 'POST',
        body: data,
      })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      setFormData({ ...formData, media_url: result.url })
      toast.success('File uploaded to Supabase Storage!')
    } catch (e: any) {
      toast.error('Failed to upload file')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = { ...formData }
      if (payload.format !== 'popup') {
        payload.display_delay_seconds = null
        payload.display_duration_seconds = null
      }
      
      // Remove joined properties before sending to backend
      delete payload.campaign
      delete payload.created_at
      delete payload.updated_at
      
      const res = await fetch('/api/admin/ads/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(payload.id ? 'Creative updated' : 'Creative created')
      setIsDialogOpen(false)
      fetchData()
    } catch (e: any) {
      toast.error('Error saving creative')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this creative?')) return
    try {
      const res = await fetch(`/api/admin/ads/creatives?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Creative deleted')
      fetchData()
    } catch (e) {
      toast.error('Failed to delete')
    }
  }

  const openEdit = (creative: any) => {
    setFormData({
      ...creative,
      display_delay_seconds: creative.display_delay_seconds || 0,
      display_duration_seconds: creative.display_duration_seconds || 0,
    })
    setIsDialogOpen(true)
  }

  const openNew = () => {
    setFormData({
      campaign_id: campaigns[0]?.id || '',
      format: 'banner',
      placement_key: '',
      title: '',
      description: '',
      media_url: '',
      destination_url: '',
      is_active: true,
      display_delay_seconds: 0,
      display_duration_seconds: 0,
    })
    setIsDialogOpen(true)
  }

  const selectedCampaign = campaigns.find(c => c.id === formData.campaign_id)
  const allowedPages = selectedCampaign?.target_pages || []
  
  const availablePlacements = PLACEMENTS.filter(p => {
    if (p.pages.includes('global')) return true
    if (allowedPages.length === 0) return true // Campaign is global (no specific pages)
    return p.pages.some(page => allowedPages.includes(page))
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Creatives</CardTitle>
          <CardDescription>Manage the actual ads (banners, popups, videos) linked to campaigns.</CardDescription>
        </div>
        
        {canCreate ? (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} data-perm="create"><Plus className="w-4 h-4 mr-2" /> New Creative</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="dialog-description">
            <DialogHeader>
              <DialogTitle>{formData.id ? 'Edit Creative' : 'Create Creative'}</DialogTitle>
              <DialogDescription id="dialog-description" className="sr-only">
                Configure your ad creative here.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Campaign</Label>
                  <Select required value={formData.campaign_id} onValueChange={v => setFormData({...formData, campaign_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Select Campaign" /></SelectTrigger>
                    <SelectContent>
                      {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Format</Label>
                  <Select required value={formData.format} onValueChange={v => setFormData({...formData, format: v})}>
                    <SelectTrigger><SelectValue placeholder="Select Format" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="banner">Banner</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="popup">Popup</SelectItem>
                      <SelectItem value="scroll_sticky">Scroll Sticky</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Placement Key</Label>
                <Select required value={formData.placement_key} onValueChange={v => setFormData({...formData, placement_key: v})}>
                  <SelectTrigger><SelectValue placeholder="Select Placement Slot" /></SelectTrigger>
                  <SelectContent>
                    {availablePlacements.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label} ({p.value})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Media</Label>
                <div className="flex gap-2">
                  <Input required value={formData.media_url} onChange={e => setFormData({...formData, media_url: e.target.value})} placeholder="URL or Upload" />
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,video/*" />
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Title (Optional)</Label>
                  <Input value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div>
                  <Label>Destination URL (Optional)</Label>
                  <Input type="url" value={formData.destination_url || ''} onChange={e => setFormData({...formData, destination_url: e.target.value})} />
                </div>
              </div>

              {formData.format === 'popup' && (
                <div className="grid grid-cols-2 gap-4 border p-4 rounded-md bg-muted/20">
                  <div>
                    <Label>Popup Delay (Seconds)</Label>
                    <Input type="number" min="0" value={formData.display_delay_seconds} onChange={e => setFormData({...formData, display_delay_seconds: parseInt(e.target.value)})} />
                  </div>
                  <div>
                    <Label>Auto-Close Duration (Seconds, 0 for off)</Label>
                    <Input type="number" min="0" value={formData.display_duration_seconds} onChange={e => setFormData({...formData, display_duration_seconds: parseInt(e.target.value)})} />
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Switch checked={formData.is_active} onCheckedChange={c => setFormData({...formData, is_active: c})} />
                <Label>Active</Label>
              </div>
              <DialogFooter>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        ) : null}
      </CardHeader>
      
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Preview</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Status</TableHead>
              {showActionsCol ? (
              <TableHead className="text-right" data-perm-col="edit">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={tableColSpan} className="text-center py-4 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : creatives.length === 0 ? (
              <TableRow><TableCell colSpan={tableColSpan} className="text-center py-4 text-muted-foreground">No creatives found.</TableCell></TableRow>
            ) : (
              creatives.map(c => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.media_url ? (
                      c.format === 'video' ? (
                        <video src={c.media_url} className="w-16 h-10 object-cover rounded" muted />
                      ) : (
                        <img src={c.media_url} className="w-16 h-10 object-cover rounded" alt="ad preview" />
                      )
                    ) : '-'}
                  </TableCell>
                  <TableCell className="font-medium capitalize">{c.format.replace('_', ' ')}</TableCell>
                  <TableCell>{c.campaign?.name || 'Unknown'}</TableCell>
                  <TableCell><Badge variant="outline">{c.placement_key}</Badge></TableCell>
                  <TableCell>
                    {c.is_active ? <Badge className="bg-green-500">Active</Badge> : <Badge variant="secondary">Paused</Badge>}
                  </TableCell>
                  {showActionsCol ? (
                  <TableCell className="text-right space-x-2" data-perm-col="edit">
                    {canEdit ? (
                    <Button variant="ghost" size="icon" data-perm="edit" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    ) : null}
                    {canDelete ? (
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" data-perm="delete" onClick={() => handleDelete(c.id)}><Trash className="w-4 h-4" /></Button>
                    ) : null}
                  </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
