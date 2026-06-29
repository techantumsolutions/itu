'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuthStore } from '@/lib/stores'
import { toast } from 'sonner'
import type { User } from '@/lib/types'
import { clientHasAdminPermission } from '@/lib/auth/client-features'
import {
  ADMIN_PERMISSION_GROUPS,
  ADMIN_PERMISSION_KEYS,
  ADMIN_PERMISSION_LABELS,
  defaultLimitedAdminPermissions,
  migrateLegacyPermissions,
  type AdminPermissionKey,
} from '@/lib/auth/admin-permissions'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'

function adminHeaders(user: User) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': user.id,
    'x-user-email': user.email,
    'x-user-name': user.name ?? 'Admin',
    'x-user-role': user.role,
  }
}

type StaffRow = {
  id: string
  email: string
  name: string
  app_role: string
  admin_permissions: Record<string, boolean> | null
  is_active: boolean
}

export default function AdminStaffPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [perm, setPerm] = useState<Record<AdminPermissionKey, boolean>>(defaultLimitedAdminPermissions())
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const canView = user && clientHasAdminPermission(user, 'admin_users.view')
  const canCreate = user && clientHasAdminPermission(user, 'admin_users.create')
  const canEdit = user && clientHasAdminPermission(user, 'admin_users.edit')

  const load = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/staff', { credentials: 'include', headers: adminHeaders(user) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setStaff(Array.isArray(data.staff) ? data.staff : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [canView, user])

  useEffect(() => {
    if (user && !canView) {
      toast.error('You do not have permission to view admin users')
      router.replace('/admin')
    }
  }, [user, canView, router])

  useEffect(() => {
    void load()
  }, [load])

  const togglePerm = (k: AdminPermissionKey, v: boolean) => {
    setPerm((p) => ({ ...p, [k]: v }))
  }

  const createStaff = async () => {
    if (!user || !canCreate) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        credentials: 'include',
        headers: adminHeaders(user),
        body: JSON.stringify({ email, name, permissions: perm }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Create failed')
      toast.success('Admin user created')
      setEmail('')
      setName('')
      setPerm(defaultLimitedAdminPermissions())
      setDialogOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  if (!user || !canView) {
    return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>
  }

  const activePermsCount = Object.values(perm).filter(Boolean).length

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin users</h1>
          <p className="text-muted-foreground text-sm">
            Manage limited admin accounts and their module permissions.
          </p>
        </div>
        {canCreate ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800">
              Create Admin
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Create limited admin</DialogTitle>
              <DialogDescription>
                Creates a Supabase Auth user and a profile with app_role admin and sends an invitation email to set the password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  placeholder="admin-user@company.com"
                  className="rounded-xl h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-name">Display name</Label>
                <Input
                  id="create-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="rounded-xl h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label>Permissions</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between rounded-xl h-11 border-neutral-200 bg-white font-normal hover:bg-neutral-50 text-left">
                      <span className="text-neutral-700 truncate">
                        {activePermsCount === 0
                          ? "Select permissions..."
                          : `${activePermsCount} permissions selected`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[340px] max-h-[360px] overflow-y-auto p-1.5 rounded-xl shadow-elevated" align="start">
                    {ADMIN_PERMISSION_GROUPS.map((group) => (
                      <div key={group.module} className="px-1 py-1">
                        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.module}
                        </p>
                        {group.keys.map((k) => (
                          <DropdownMenuItem
                            key={k}
                            onSelect={(e: Event) => {
                              e.preventDefault()
                              togglePerm(k, !perm[k])
                            }}
                            className="rounded-lg cursor-pointer flex items-center gap-2.5"
                          >
                            <div className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                              perm[k]
                                ? "border-neutral-900 bg-neutral-900 text-white"
                                : "border-neutral-300 bg-white"
                            )}>
                              {perm[k] && <Check className="size-3 text-white stroke-[3px]" />}
                            </div>
                            <span className="text-sm text-neutral-700">{ADMIN_PERMISSION_LABELS[k]}</span>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <DialogFooter className="mt-4 gap-3">
              <DialogClose asChild>
                <Button variant="outline" className="rounded-xl h-11">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={saving} onClick={() => void createStaff()} className="rounded-xl h-11 bg-neutral-900 text-white hover:bg-neutral-800">
                {saving ? 'Creating…' : 'Create admin'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Existing admins</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="w-full min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap">Role</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Permissions</TableHead>
                  {canEdit ? (
                  <TableHead className="whitespace-nowrap">Actions</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 5 : 4} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((row) => (
                    <StaffPermissionsRow
                      key={row.id}
                      row={row}
                      canEdit={!!canEdit}
                      onSave={async (next) => {
                        await saveRow(user, row, next)
                        await load()
                      }}
                      onToggleStatus={async (id, active) => {
                        await toggleStatus(user, id, active)
                        await load()
                      }}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


    </div>
  )
}

async function saveRow(actor: User, row: StaffRow, next: Record<AdminPermissionKey, boolean>) {
  if (row.app_role === 'super_admin') {
    toast.error('Cannot change permissions for super admin accounts here')
    return
  }
  try {
    const res = await fetch(`/api/admin/staff/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: adminHeaders(actor),
      body: JSON.stringify({ permissions: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'Update failed')
    toast.success('Permissions updated')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Update failed')
  }
}

async function toggleStatus(actor: User, id: string, active: boolean) {
  try {
    const res = await fetch(`/api/admin/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: adminHeaders(actor),
      body: JSON.stringify({ is_active: active }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'Status update failed')
    toast.success(`User status updated to ${active ? 'Active' : 'Inactive'}`)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Status update failed')
  }
}

function StaffPermissionsRow({
  row,
  canEdit,
  onSave,
  onToggleStatus,
}: {
  row: StaffRow
  canEdit: boolean
  onSave: (p: Record<AdminPermissionKey, boolean>) => void | Promise<void>
  onToggleStatus: (id: string, active: boolean) => void | Promise<void>
}) {
  const base = defaultLimitedAdminPermissions()
  const raw = row.admin_permissions
  if (raw && typeof raw === 'object') {
    const migrated = migrateLegacyPermissions(raw)
    for (const k of ADMIN_PERMISSION_KEYS) {
      base[k] = migrated[k]
    }
  } else if (row.app_role === 'admin') {
    for (const k of ADMIN_PERMISSION_KEYS) base[k] = true
  }
  const [local, setLocal] = useState(base)

  const activeCount = Object.values(local).filter(Boolean).length

  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">{row.email}</TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="text-xs uppercase text-muted-foreground">{row.app_role}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {row.app_role === 'super_admin' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
            Active
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${row.is_active
            ? 'bg-green-50 text-green-700 ring-green-600/20'
            : 'bg-red-50 text-red-700 ring-red-600/20'
            }`}>
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {row.app_role === 'super_admin' ? (
          <span className="text-sm text-muted-foreground">Full access</span>
        ) : canEdit ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="w-fit text-xs font-semibold gap-1.5 border-neutral-200">
                Manage Permissions
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-neutral-100 text-[10px] text-neutral-600 font-bold">
                  {activeCount}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[380px] max-h-[420px] overflow-y-auto p-4 space-y-4" align="start">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-neutral-900">Admin Permissions</h4>
                <p className="text-xs text-neutral-500">Enable or disable module actions for this admin account.</p>
              </div>
              {ADMIN_PERMISSION_GROUPS.map((group) => (
                <div key={group.module} className="border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{group.module}</p>
                  <div className="grid gap-2">
                    {group.keys.map((k) => (
                      <label key={k} className="flex items-center gap-2 text-xs cursor-pointer select-none hover:text-neutral-900 text-neutral-600">
                        <Checkbox checked={local[k]} onCheckedChange={(c) => setLocal((p) => ({ ...p, [k]: c === true }))} />
                        <span className="truncate">{ADMIN_PERMISSION_LABELS[k]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-t border-neutral-100 pt-3 flex justify-end gap-2">
                <Button size="sm" className="w-full text-xs font-semibold" onClick={() => void onSave(local)}>
                  Save Permissions
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-sm text-muted-foreground">{activeCount} permissions</span>
        )}
      </TableCell>
      {canEdit ? (
      <TableCell className="whitespace-nowrap">
        {row.app_role === 'super_admin' ? (
          <span className="text-xs text-muted-foreground">-</span>
        ) : (
          <div className="flex">
            <Switch
              checked={row.is_active}
              onCheckedChange={(checked) => void onToggleStatus(row.id, checked)}
            />
          </div>
        )}
      </TableCell>
      ) : null}
    </TableRow>
  )
}
