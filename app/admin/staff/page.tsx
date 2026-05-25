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
}

export default function AdminStaffPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        body: JSON.stringify({ email, password, name, permissions: perm }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Create failed')
      toast.success('Admin user created')
      setEmail('')
      setPassword('')
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
            Creates a Supabase Auth user and a profile with app_role admin and the permissions you select.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label>Temporary password (min 8)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
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
                  <TableHead>Permissions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
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

function StaffPermissionsRow({
  row,
  onSave,
}: {
  row: StaffRow
  onSave: (p: Record<AdminFeatureKey, boolean>) => void | Promise<void>
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

  return (
    <TableRow>
      <TableCell className="font-medium">{row.email}</TableCell>
      <TableCell>
        <span className="text-xs uppercase text-muted-foreground">{row.app_role}</span>
      </TableCell>
      <TableCell>
        {row.app_role === 'super_admin' ? (
          <span className="text-sm text-muted-foreground">Full access</span>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {ADMIN_FEATURE_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs">
                  <Checkbox checked={local[k]} onCheckedChange={(c) => setLocal((p) => ({ ...p, [k]: c === true }))} />
                  <span>{ADMIN_FEATURE_LABELS[k]}</span>
                </label>
              ))}
            </div>
            <Button size="sm" variant="secondary" className="w-fit" onClick={() => void onSave(local)}>
              Save
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}
