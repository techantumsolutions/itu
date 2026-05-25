'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import type { User } from '@/lib/types'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'

type AdminAuthGateProps = {
  children: React.ReactNode
}

/** Ensures the admin shell only renders after the cookie-backed session is known. */
export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refreshSession() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; user?: User | null }
        if (cancelled) return

        const user = data?.ok ? data.user ?? null : null
        setSession(user)

        if (!isClientAdminUser(user)) {
          router.replace('/admin/login')
          return
        }

        setReady(true)
      } catch {
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

  return children
}
