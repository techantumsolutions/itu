'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lock, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/lib/stores'
import { toast } from 'sonner'
import {
  readPagePasswordUnlockMap,
  writePagePasswordUnlockMap,
} from '@/lib/auth/page-password-storage'

type PagePasswordGateProps = {
  children: React.ReactNode
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const
const IDLE_CHECK_MS = 15_000

function findProtectedPrefix(pathname: string, protectedPaths: string[]): string | null {
  for (const path of protectedPaths) {
    if (pathname === path || pathname.startsWith(path + '/')) {
      return path
    }
  }
  return null
}

export function PagePasswordGate({ children }: PagePasswordGateProps) {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const [protectedPaths, setProtectedPaths] = useState<string[]>([])
  const [loadingPaths, setLoadingPaths] = useState(true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [unlockedMap, setUnlockedMap] = useState<Record<string, number>>({})
  const [idleMs, setIdleMs] = useState(20 * 60 * 1000)
  const [idleMinutes, setIdleMinutes] = useState(20)
  const hasLoadedPathsRef = React.useRef(false)
  const lastActivityRef = useRef<Record<string, number>>({})

  const isAdmin = user?.role === 'admin'
  const matchedPrefix = findProtectedPrefix(pathname, protectedPaths)

  useEffect(() => {
    if (!isAdmin) return
    setUnlockedMap(readPagePasswordUnlockMap())
    lastActivityRef.current = readPagePasswordUnlockMap()
  }, [isAdmin])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/auth/session-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { idleTimeoutMs?: number; idleTimeoutMinutes?: number }) => {
        if (cancelled) return
        if (typeof data?.idleTimeoutMs === 'number') setIdleMs(data.idleTimeoutMs)
        if (typeof data?.idleTimeoutMinutes === 'number') setIdleMinutes(data.idleTimeoutMinutes)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    async function fetchPaths() {
      if (!hasLoadedPathsRef.current) setLoadingPaths(true)
      try {
        const res = await fetch('/api/admin/settings/page-passwords')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && data.protectedPaths) {
            setProtectedPaths(data.protectedPaths)
            hasLoadedPathsRef.current = true
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingPaths(false)
      }
    }
    void fetchPaths()
    return () => {
      cancelled = true
    }
  }, [isAdmin, pathname])

  // Lock sections when navigating away from a protected prefix.
  useEffect(() => {
    if (!isAdmin) return
    setUnlockedMap((prev) => {
      let changed = false
      const next: Record<string, number> = {}
      for (const [key, value] of Object.entries(prev)) {
        if (key === matchedPrefix) {
          next[key] = value
        } else {
          changed = true
          delete lastActivityRef.current[key]
        }
      }
      if (changed) writePagePasswordUnlockMap(next)
      return changed ? next : prev
    })
  }, [isAdmin, matchedPrefix])

  const bumpPageActivity = useCallback(
    (prefix: string) => {
      const now = Date.now()
      lastActivityRef.current[prefix] = now
      setUnlockedMap((prev) => {
        if (!prev[prefix]) return prev
        const next = { ...prev, [prefix]: now }
        writePagePasswordUnlockMap(next)
        return next
      })
    },
    [],
  )

  // Track activity and re-lock after inactivity on the current protected page.
  useEffect(() => {
    if (!isAdmin || !matchedPrefix || !unlockedMap[matchedPrefix]) return

    const bump = () => bumpPageActivity(matchedPrefix)

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, bump, { passive: true })
    }

    const interval = window.setInterval(() => {
      const last = lastActivityRef.current[matchedPrefix] ?? unlockedMap[matchedPrefix]
      if (!last) return
      if (Date.now() - last >= idleMs) {
        setUnlockedMap((prev) => {
          if (!prev[matchedPrefix]) return prev
          const next = { ...prev }
          delete next[matchedPrefix]
          delete lastActivityRef.current[matchedPrefix]
          writePagePasswordUnlockMap(next)
          return next
        })
        toast.message('This section was locked due to inactivity.')
      }
    }, IDLE_CHECK_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, bump)
      }
      window.clearInterval(interval)
    }
  }, [isAdmin, matchedPrefix, unlockedMap, idleMs, bumpPageActivity])

  if (!isAdmin) {
    return <>{children}</>
  }

  if (loadingPaths) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Checking page protection...</p>
      </div>
    )
  }

  if (!matchedPrefix) {
    return <>{children}</>
  }

  const unlockTime = unlockedMap[matchedPrefix]
  const lastActivity = lastActivityRef.current[matchedPrefix] ?? unlockTime
  const isUnlocked = Boolean(unlockTime && lastActivity && Date.now() - lastActivity < idleMs)

  if (isUnlocked) {
    return <>{children}</>
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/admin/settings/page-passwords/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: matchedPrefix, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        const now = Date.now()
        const nextMap = { ...unlockedMap, [matchedPrefix]: now }
        lastActivityRef.current[matchedPrefix] = now
        setUnlockedMap(nextMap)
        writePagePasswordUnlockMap(nextMap)
        setPassword('')
        toast.success('Access granted')
      } else {
        setError(data.error ?? 'Incorrect password')
      }
    } catch {
      setError('Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/70 shadow-elevated rounded-2xl bg-card/80 backdrop-blur-xl">
        <CardHeader className="space-y-2 text-center pb-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 border border-amber-200 shadow-sm animate-pulse">
            <Lock className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">Protected Area</CardTitle>
          <CardDescription className="text-sm">
            This section requires a password. It stays unlocked while you are active on this page, and locks
            when you leave or after {idleMinutes} minutes of inactivity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive border border-destructive/20 animate-shake">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={(e) => void handleVerify(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="page-password">Enter Password</Label>
              <div className="relative">
                <Input
                  id="page-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl pr-10 border-neutral-200"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="h-11 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
              disabled={verifying || !password.trim()}
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Unlock Section'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
