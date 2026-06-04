'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import type { User } from '@/lib/types'
import { isClientAdminUser, isClientSuperAdmin } from '@/lib/tickets/auth-headers'
import { clientHasAdminFeature, getRequiredFeatureForPath } from '@/lib/auth/client-features'

type AdminAuthGateProps = {
  children: React.ReactNode
}

/** Ensures the admin shell only renders after the cookie-backed session is known. */
export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const router = useRouter()
  const pathname = usePathname()
  const setSession = useAuthStore((s) => s.setSession)
  const user = useAuthStore((s) => s.user)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refreshSession() {
      try {
        console.log('[AdminAuthGate] Fetching /api/auth/me...')
        const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; user?: User | null }
        console.log('[AdminAuthGate] /api/auth/me response:', data)
        if (cancelled) return

        const user = data?.ok ? data.user ?? null : null
        setSession(user)

        if (!isClientAdminUser(user)) {
          console.warn('[AdminAuthGate] User is not an admin, redirecting to /admin/login. User:', user)
          router.replace('/admin/login')
          return
        }

        console.log('[AdminAuthGate] User verified as admin:', user)
        setReady(true)
      } catch (err) {
        console.error('[AdminAuthGate] Error fetching session:', err)
        if (!cancelled) router.replace('/admin/login')
      }
    }

    void refreshSession()

    return () => {
      cancelled = true
    }
  }, [router, setSession])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-4 shadow-sm">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm font-medium">Loading admin session…</span>
        </div>
      </div>
    )
  }

  // Check route-level permissions
  const requiredFeature = getRequiredFeatureForPath(pathname)
  let authorized = true

  if (requiredFeature === 'super_admin') {
    authorized = isClientSuperAdmin(user)
  } else if (requiredFeature) {
    authorized = clientHasAdminFeature(user, requiredFeature)
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-10" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Access Denied</h1>
        <p className="max-w-md text-center text-muted-foreground">
          You do not have the required permissions to view this page. If you believe this is an error, please contact a super administrator.
        </p>
      </div>
    )
  }

  return children
}
