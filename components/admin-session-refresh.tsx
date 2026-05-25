'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/stores'

import type { User } from '@/lib/types'

/** Refreshes the persisted user from `/api/auth/me` (roles + permissions from `profiles`). */
export function AdminSessionRefresh() {
  const setSession = useAuthStore((s) => s.setSession)

  useEffect(() => {
    const p = useAuthStore.persist
    const run = () => {
      void fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        .then((r) => r.json())
        .then((d: { ok?: boolean; user?: User | null }) => {
          if (d?.ok && d.user?.id) setSession(d.user)
        })
        .catch(() => {})
    }
    if (p?.hasHydrated?.()) run()
    return p?.onFinishHydration?.(() => run())
  }, [setSession])

  return null
}
