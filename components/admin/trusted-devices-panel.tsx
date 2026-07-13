'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MonitorSmartphone, RefreshCw, LogOut, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFingerprint } from '@/hooks/use-fingerprint'
import { useAuthStore } from '@/lib/stores'
import { useRouter } from 'next/navigation'

type TrustedDeviceListItem = {
  id: string
  user_id: string
  device_fingerprint: string
  device_name: string | null
  last_login_at: string | null
  created_at: string | null
  last_ip: string | null
  last_country: string | null
  device_info: string | null
  email: string | null
  name: string | null
  app_role: string | null
  is_current: boolean
}

function formatWhen(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function TrustedDevicesPanel() {
  const fingerprint = useFingerprint()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const logout = useAuthStore((s) => s.logout)
  const router = useRouter()
  const [devices, setDevices] = useState<TrustedDeviceListItem[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [forceBusyUserId, setForceBusyUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!fingerprint) return

    setLoading(true)
    try {
      // Ensure this browser is registered while the admin is actively signed in
      const registerRes = await fetch('/api/admin/settings/trusted-devices/register-current', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-device-fingerprint': fingerprint,
        },
        body: JSON.stringify({ fingerprint }),
      })
      if (!registerRes.ok) {
        const regErr = await registerRes.json().catch(() => ({}))
        console.warn('[trusted-devices] register-current failed:', regErr?.error || registerRes.status)
      }

      const res = await fetch('/api/admin/settings/trusted-devices', {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'x-device-fingerprint': fingerprint },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load trusted devices')
      }

      const rows = (Array.isArray(data.devices) ? data.devices : []) as TrustedDeviceListItem[]
      // Mark current device on the client (more reliable than header-only matching)
      setDevices(
        rows.map((d) => ({
          ...d,
          is_current: Boolean(
            fingerprint &&
              d.device_fingerprint === fingerprint &&
              (!currentUserId || d.user_id === currentUserId),
          ),
        })),
      )
      setCanManage(Boolean(data.canManage))
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load trusted devices')
    } finally {
      setLoading(false)
    }
  }, [fingerprint, currentUserId])

  useEffect(() => {
    void load()
  }, [load])

  const revokeDevice = async (device: TrustedDeviceListItem) => {
    if (!canManage) return
    setBusyId(device.id)
    try {
      const res = await fetch(`/api/admin/settings/trusted-devices/${device.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to revoke device')
      toast.success('Device trust revoked. Next login from that browser will require 2FA.')
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revoke device')
    } finally {
      setBusyId(null)
    }
  }

  const forceLogoutUser = async (userId: string, label: string) => {
    if (!canManage) return
    const ok = window.confirm(
      `Force logout all sessions for ${label}?\n\nThis invalidates their current logins and clears trusted devices. They must sign in again (with 2FA if enabled).`,
    )
    if (!ok) return

    setForceBusyUserId(userId)
    try {
      const res = await fetch('/api/admin/settings/trusted-devices/force-logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Force logout failed')
      toast.success(data.message || 'Sessions invalidated')
      if (data.self) {
        logout()
        router.push('/admin/login')
        return
      }
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Force logout failed')
    } finally {
      setForceBusyUserId(null)
    }
  }

  const byUser = devices.reduce<Record<string, TrustedDeviceListItem[]>>((acc, d) => {
    ;(acc[d.user_id] ??= []).push(d)
    return acc
  }, {})

  // Put the current user's group first, and current device first within a group
  const userGroups = Object.entries(byUser).sort(([aId, aRows], [bId, bRows]) => {
    const aCurrent = aRows.some((r) => r.is_current) || aId === currentUserId
    const bCurrent = bRows.some((r) => r.is_current) || bId === currentUserId
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1
    return 0
  })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            <MonitorSmartphone className="size-4" />
            Trusted admin devices
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Devices that have completed login{canManage ? ' for admin accounts' : ''}. Your current
            browser is marked Active. Revoking trust requires 2FA on next sign-in. Force logout ends
            active sessions.
          </p>
          {!canManage ? (
            <p className="text-xs text-muted-foreground mt-1">
              Showing your devices only. Super admins can revoke devices and force-logout any admin.
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading || !fingerprint}
        >
          {loading || !fingerprint ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ml-2">{!fingerprint ? 'Detecting device…' : 'Refresh'}</span>
        </Button>
      </div>

      {!fingerprint || (loading && devices.length === 0) ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="size-4 animate-spin" />
          {!fingerprint ? 'Detecting this browser…' : 'Loading devices…'}
        </div>
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No trusted devices recorded yet. Open this tab again after FingerprintJS finishes, or sign
          out and back in once.
        </p>
      ) : (
        <div className="space-y-6">
          {userGroups.map(([userId, rows]) => {
            const ordered = [...rows].sort((a, b) => Number(b.is_current) - Number(a.is_current))
            const head = ordered[0]
            const label = head.email || head.name || userId
            return (
              <div key={userId} className="rounded-xl border border-border/60 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {head.app_role?.replace('_', ' ') || 'admin'} · {ordered.length} device
                      {ordered.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={forceBusyUserId === userId}
                      onClick={() => void forceLogoutUser(userId, label)}
                    >
                      {forceBusyUserId === userId ? (
                        <Loader2 className="size-4 animate-spin mr-2" />
                      ) : (
                        <LogOut className="size-4 mr-2" />
                      )}
                      Force logout all
                    </Button>
                  ) : null}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Last login</TableHead>
                      {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordered.map((d) => (
                      <TableRow key={d.id} className={d.is_current ? 'bg-emerald-50/60' : undefined}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">{d.device_info || 'Unknown browser'}</span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {d.device_fingerprint.slice(0, 16)}…
                            </span>
                            {d.is_current ? (
                              <Badge className="w-fit text-[10px] bg-emerald-600 hover:bg-emerald-600">
                                Active · This device
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{d.last_country || 'Unknown'}</div>
                          <div className="text-xs font-mono text-muted-foreground">{d.last_ip || '—'}</div>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatWhen(d.last_login_at || d.created_at)}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busyId === d.id}
                              onClick={() => void revokeDevice(d)}
                            >
                              {busyId === d.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                              <span className="ml-2">Revoke</span>
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
