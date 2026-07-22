'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/stores'

/**
 * Keeps the persisted auth user fresh (roles, permissions, reward points).
 * Runs after zustand rehydrate, on route changes, and when the tab becomes visible.
 */
export function SessionRefresh() {
  const refreshSession = useAuthStore((s) => s.refreshSession)
  const pathname = usePathname()

  useEffect(() => {
    const p = useAuthStore.persist
    const run = () => {
      void refreshSession()
    }
    if (p?.hasHydrated?.()) run()
    const unsub = p?.onFinishHydration?.(() => run())

    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      unsub?.()
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshSession])

  useEffect(() => {
    void refreshSession()
  }, [pathname, refreshSession])

  return null
}

/** @deprecated Use SessionRefresh */
export const AdminSessionRefresh = SessionRefresh
