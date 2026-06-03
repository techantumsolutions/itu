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
import { isClientSuperAdmin } from '@/lib/tickets/auth-headers'
import { toast } from 'sonner'
import type { User } from '@/lib/types'
import {
  ADMIN_FEATURE_KEYS,
  ADMIN_FEATURE_LABELS,
  defaultLimitedAdminPermissions,
  type AdminFeatureKey,
} from '@/lib/auth/admin-features'

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
  const [perm, setPerm] = useState<Record<AdminFeatureKey, boolean>>(defaultLimitedAdminPermissions())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user || !isClientSuperAdmin(user)) return
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
  }, [user])

  useEffect(() => {
    if (user && !isClientSuperAdmin(user)) {
      toast.error('Super admin only')
      router.replace('/admin')
    }
  }, [user, router])

  useEffect(() => {
    void load()
  }, [load])

  const togglePerm = (k: AdminFeatureKey, v: boolean) => {
    setPerm((p) => ({ ...p, [k]: v }))
  }

  const createStaff = async () => {
    if (!user || !isClientSuperAdmin(user)) return
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
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  if (!user || !isClientSuperAdmin(user)) {
    return <div className="p-6 text-sm text-muted-foreground">Checking access…</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin users</h1>
        <p className="text-muted-foreground text-sm">
          Super admins manage limited admins. Run <code className="text-xs">profiles_admin_roles.sql</code> in
          Supabase so the owner account is <code className="text-xs">super_admin</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create limited admin</CardTitle>
          <CardDescription>
            Creates a Supabase Auth user and a profile with app_role admin and sends an invitation email to set the password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label>Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {ADMIN_FEATURE_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={perm[k]} onCheckedChange={(c) => togglePerm(k, c === true)} />
                <span>{ADMIN_FEATURE_LABELS[k]}</span>
              </label>
            ))}
          </div>
          <Button disabled={saving} onClick={() => void createStaff()}>
            {saving ? 'Creating…' : 'Create admin'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing admins</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((row) => (
                    <StaffPermissionsRow
                      key={row.id}
                      row={row}
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

      <Button variant="outline" asChild>
        <Link href="/admin">Back to dashboard</Link>
      </Button>
    </div>
  )
}

async function saveRow(actor: User, row: StaffRow, next: Record<AdminFeatureKey, boolean>) {
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
  onSave,
  onToggleStatus,
}: {
  row: StaffRow
  onSave: (p: Record<AdminFeatureKey, boolean>) => void | Promise<void>
  onToggleStatus: (id: string, active: boolean) => void | Promise<void>
}) {
  const base: Record<AdminFeatureKey, boolean> = { ...defaultLimitedAdminPermissions() }
  const raw = row.admin_permissions
  if (raw && typeof raw === 'object') {
    for (const k of ADMIN_FEATURE_KEYS) {
      if (k in raw) base[k] = Boolean((raw as Record<string, boolean>)[k])
    }
  } else if (row.app_role === 'admin') {
    for (const k of ADMIN_FEATURE_KEYS) base[k] = true
  }
  const [local, setLocal] = useState(base)

  const activeCount = Object.values(local).filter(Boolean).length

  return (
    <TableRow>
      <TableCell className="font-medium">{row.email}</TableCell>
      <TableCell>
        <span className="text-xs uppercase text-muted-foreground">{row.app_role}</span>
      </TableCell>
      <TableCell>
        {row.app_role === 'super_admin' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
            Active
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
            row.is_active
              ? 'bg-green-50 text-green-700 ring-green-600/20'
              : 'bg-red-50 text-red-700 ring-red-600/20'
          }`}>
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        )}
      </TableCell>
      <TableCell>
        {row.app_role === 'super_admin' ? (
          <span className="text-sm text-muted-foreground">Full access</span>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="w-fit text-xs font-semibold gap-1.5 border-neutral-200">
                Manage Permissions
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-neutral-100 text-[10px] text-neutral-600 font-bold">
                  {activeCount}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-4 space-y-4" align="start">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-neutral-900">Admin Permissions</h4>
                <p className="text-xs text-neutral-500">Enable or disable features for this admin account.</p>
              </div>
              <div className="grid gap-2 grid-cols-2 border-t border-neutral-100 pt-3">
                {ADMIN_FEATURE_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs cursor-pointer select-none hover:text-neutral-900 text-neutral-600">
                    <Checkbox checked={local[k]} onCheckedChange={(c) => setLocal((p) => ({ ...p, [k]: c === true }))} />
                    <span className="truncate">{ADMIN_FEATURE_LABELS[k]}</span>
                  </label>
                ))}
              </div>
              <div className="border-t border-neutral-100 pt-3 flex justify-end gap-2">
                <Button size="sm" className="w-full text-xs font-semibold" onClick={() => void onSave(local)}>
                  Save Permissions
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </TableCell>
      <TableCell>
        {row.app_role === 'super_admin' ? (
          <span className="text-xs text-muted-foreground">-</span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className={`text-xs font-semibold ${row.is_active ? 'text-red-600 hover:text-red-700 hover:bg-red-50' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
            onClick={() => void onToggleStatus(row.id, !row.is_active)}
          >
            {row.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
