'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuthStore } from '@/lib/stores'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'
import { clientCanShowProviderNames } from '@/lib/auth/client-features'
import {
  buildProviderLabelMaps,
  displayProviderLabel,
  displayProviderNamesCsv,
  type ProviderLabelInput,
  type ProviderLabelMaps,
  type ProviderLabelSource,
} from '@/lib/admin/provider-display-labels'
import type { User } from '@/lib/types'

type ProviderDisplayContextValue = {
  ready: boolean
  showNames: boolean
  displayProvider: (input: ProviderLabelInput) => string
  displayProvidersCsv: (names: string[]) => string
  /** Dropdown label: masked P{n} or "Name (code)" when names visible. */
  displayProviderOption: (provider: ProviderLabelSource) => string
}

const fallbackMaps: ProviderLabelMaps = {
  byId: new Map(),
  byCode: new Map(),
  byName: new Map(),
}

const passthroughValue: ProviderDisplayContextValue = {
  ready: true,
  showNames: true,
  displayProvider: (input) => input.name?.trim() || input.code?.trim() || '—',
  displayProvidersCsv: (names) => {
    const filtered = names.map((n) => n?.trim()).filter(Boolean)
    return filtered.length > 0 ? filtered.join(', ') : '—'
  },
  displayProviderOption: (p) => `${p.name} (${p.code})`,
}

const ProviderDisplayContext = createContext<ProviderDisplayContextValue>(passthroughValue)

function adminHeaders(user: User) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': user.id,
    'x-user-email': user.email,
    'x-user-name': user.name ?? 'Admin',
    'x-user-role': user.role,
  }
}

export function AdminProviderDisplayProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const [providers, setProviders] = useState<ProviderLabelSource[]>([])
  const [ready, setReady] = useState(false)

  const showNames = useMemo(() => clientCanShowProviderNames(user), [user])

  useEffect(() => {
    if (!user || !isClientAdminUser(user)) {
      setProviders([])
      setReady(true)
      return
    }

    let cancelled = false
    setReady(false)

    fetch('/api/admin/lcr/providers', {
      credentials: 'include',
      headers: adminHeaders(user),
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data?.providers) ? data.providers : []
        setProviders(
          list.map((p: ProviderLabelSource) => ({
            id: String(p.id),
            code: String(p.code ?? ''),
            name: String(p.name ?? ''),
            priority: Number(p.priority) || 0,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setProviders([])
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const maps = useMemo(() => buildProviderLabelMaps(providers), [providers])

  const displayProvider = useCallback(
    (input: ProviderLabelInput) => displayProviderLabel(input, maps, showNames),
    [maps, showNames],
  )

  const displayProvidersCsv = useCallback(
    (names: string[]) => displayProviderNamesCsv(names, maps, showNames),
    [maps, showNames],
  )

  const displayProviderOption = useCallback(
    (provider: ProviderLabelSource) => {
      if (showNames) return `${provider.name} (${provider.code})`
      return displayProviderLabel({ id: provider.id, code: provider.code, name: provider.name }, maps, false)
    },
    [maps, showNames],
  )

  const value = useMemo(
    (): ProviderDisplayContextValue => ({
      ready,
      showNames,
      displayProvider,
      displayProvidersCsv,
      displayProviderOption,
    }),
    [ready, showNames, displayProvider, displayProvidersCsv, displayProviderOption],
  )

  return <ProviderDisplayContext.Provider value={value}>{children}</ProviderDisplayContext.Provider>
}

export function useProviderDisplay(): ProviderDisplayContextValue {
  return useContext(ProviderDisplayContext)
}

export { fallbackMaps }
