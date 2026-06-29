'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Trash, Plus, Pencil, Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useAdminModulePermissions } from '@/lib/hooks/use-admin-module-permissions'

const AVAILABLE_PAGES = [
  { value: '/', label: 'Home Page (/)' },
  { value: '/topup', label: 'Top-up (/topup)' },
  { value: '/login', label: 'Login (/login)' },
  { value: '/register', label: 'Register (/register)' },
  { value: '/help', label: 'Help & FAQ (/help)' },
  { value: '/account', label: 'My Account (/account)' },
  { value: '/account/transactions', label: 'Transactions (/account/transactions)' },
]

export function CampaignsTab() {
  const { canCreate, canEdit, canDelete } = useAdminModulePermissions('ads')
  const showActionsCol = canEdit || canDelete
  const tableColSpan = showActionsCol ? 5 : 4
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [countries, setCountries] = useState<{ value: string, label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  const [formData, setFormData] = useState<any>({ 
    name: '', start_date: '', end_date: '', target_countries: [], target_pages: [], is_active: true 
  })
  
  const fetchCampaigns = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ads/campaigns')
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (e) {
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const fetchCountries = async () => {
    try {
      const res = await fetch('/api/countries')
      const data = await res.json()
      if (Array.isArray(data.countries)) {
        setCountries(data.countries.map((c: any) => ({
          value: c.code,
          label: `${c.flag || ''} ${c.name}`.trim()
        })))
      }
    } catch (e) {
      console.error('Failed to fetch countries', e)
    }
  }

  useEffect(() => {
    fetchCampaigns()
    fetchCountries()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        ...formData,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
        target_countries: formData.target_countries.length > 0 ? formData.target_countries : null,
        target_pages: formData.target_pages.length > 0 ? formData.target_pages : null,
      }
      
      const res = await fetch('/api/admin/ads/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(payload.id ? 'Campaign updated' : 'Campaign created')
      setIsDialogOpen(false)
      fetchCampaigns()
    } catch (e: any) {
      toast.error('Error saving campaign')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return
    try {
      const res = await fetch(`/api/admin/ads/campaigns?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Campaign deleted')
      fetchCampaigns()
    } catch (e) {
      toast.error('Failed to delete')
    }
  }

  const openEdit = (campaign: any) => {
    setFormData({
      ...campaign,
      start_date: campaign.start_date ? new Date(campaign.start_date).toISOString().slice(0, 16) : '',
      end_date: campaign.end_date ? new Date(campaign.end_date).toISOString().slice(0, 16) : '',
      target_countries: campaign.target_countries || [],
      target_pages: campaign.target_pages || []
    })
    setIsDialogOpen(true)
  }

  const openNew = () => {
    setFormData({ name: '', start_date: '', end_date: '', target_countries: [], target_pages: [], is_active: true })
    setIsDialogOpen(true)
  }

  // Generic Multiselect Component Render function
  const renderMultiSelect = (
    label: string, 
    options: {value: string, label: string}[], 
    selectedValues: string[], 
    onChange: (vals: string[]) => void,
    placeholder: string
  ) => {
    const handleSelect = (val: string) => {
      if (selectedValues.includes(val)) {
        onChange(selectedValues.filter(v => v !== val))
      } else {
        onChange([...selectedValues, val])
      }
    }

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-auto py-2">
            <span className="truncate">
              {selectedValues.length === 0 
                ? placeholder 
                : `${selectedValues.length} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label}...`} />
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedValues.includes(option.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Campaigns</CardTitle>
          <CardDescription>Manage your ad campaigns and their targeting rules.</CardDescription>
        </div>
        
        {canCreate ? (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} data-perm="create"><Plus className="w-4 h-4 mr-2" /> New Campaign</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{formData.id ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
              <DialogDescription>Set the name and duration of the campaign.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Campaign Name</Label>
                <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g., Summer Sale" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input type="datetime-local" required value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="datetime-local" required value={formData.end_date} onChange={e => setFormData({...formData, end_date: e.target.value})} />
                </div>
              </div>
              <div>
                <Label>Target Countries</Label>
                {renderMultiSelect(
                  'countries', 
                  countries, 
                  formData.target_countries, 
                  (vals) => setFormData({ ...formData, target_countries: vals }),
                  'Global (All Countries)'
                )}
                {formData.target_countries.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.target_countries.map((code: string) => (
                      <Badge variant="secondary" key={code} className="text-xs">{code}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label>Target Pages</Label>
                {renderMultiSelect(
                  'pages', 
                  AVAILABLE_PAGES, 
                  formData.target_pages, 
                  (vals) => setFormData({ ...formData, target_pages: vals }),
                  'All Pages'
                )}
                {formData.target_pages.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.target_pages.map((path: string) => (
                      <Badge variant="secondary" key={path} className="text-xs">{path}</Badge>
                    ))}
                  </div>
                )}
              </div>
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
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Targeting</TableHead>
              <TableHead>Dates</TableHead>
              {showActionsCol ? (
              <TableHead className="text-right" data-perm-col="edit">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={tableColSpan} className="text-center py-4 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow><TableCell colSpan={tableColSpan} className="text-center py-4 text-muted-foreground">No campaigns found.</TableCell></TableRow>
            ) : (
              campaigns.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    {c.is_active ? <Badge className="bg-green-500 hover:bg-green-600">Active</Badge> : <Badge variant="secondary">Paused</Badge>}
                  </TableCell>
                  <TableCell>
                    {c.target_countries?.length ? c.target_countries.join(', ') : 'Global'}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      Start: {new Date(c.start_date).toLocaleDateString()}<br/>
                      End: {new Date(c.end_date).toLocaleDateString()}
                    </div>
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
