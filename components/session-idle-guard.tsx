'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores'
import { useIdleTimeout } from '@/hooks/use-idle-timeout'
import { getLoginPathForRole } from '@/lib/auth/session-idle-config'
import { clearPagePasswordUnlocks } from '@/lib/auth/page-password-storage'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'

const AUTH_PATH_PREFIXES = [
  '/login',
  '/register',
  '/reset-password',
  '/admin/login',
  '/admin-user/login',
  '/admin/setup-password',
]

type SessionIdleGuardProps = {
  variant: 'public' | 'admin'
}

export function SessionIdleGuard({ variant }: SessionIdleGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)
  const [idleMs, setIdleMs] = useState<number | null>(null)
  const [fired, setFired] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/auth/session-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { idleTimeoutMs?: number }) => {
        if (cancelled) return
        const ms = typeof data?.idleTimeoutMs === 'number' ? data.idleTimeoutMs : 20 * 60 * 1000
        setIdleMs(ms)
      })
      .catch(() => {
        if (!cancelled) setIdleMs(20 * 60 * 1000)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const onAuthPage = useMemo(
    () => AUTH_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
    [pathname],
  )

  const enabled = useMemo(() => {
    if (!user || !idleMs || fired || onAuthPage) return false
    if (variant === 'admin') return isClientAdminUser(user)
    return isAuthenticated && !isClientAdminUser(user)
  }, [user, idleMs, fired, onAuthPage, variant, isAuthenticated])

  useEffect(() => {
    setFired(false)
  }, [user?.id])

  const handleIdle = useCallback(() => {
    if (fired) return
    setFired(true)
    const role = user?.role
    clearPagePasswordUnlocks()
    logout()
    const loginPath = getLoginPathForRole(role)
    toast.info('Your session ended due to inactivity. Please sign in again.')
    router.replace(loginPath)
  }, [fired, logout, router, user?.role])

  useIdleTimeout({
    enabled,
    idleMs: idleMs ?? 0,
    onIdle: handleIdle,
  })

  return null
}
