'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Lock, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/lib/stores'
import { toast } from 'sonner'

type PagePasswordGateProps = {
  children: React.ReactNode
}

const UNLOCK_DURATION = 20 * 60 * 1000 // 20 minutes in milliseconds

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
  const [loadingPaths, setLoadingPaths] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [unlockedMap, setUnlockedMap] = useState<Record<string, number>>({})

  const isAdmin = user?.role === 'admin'

  // Load unlocked sessions from sessionStorage
  useEffect(() => {
    if (!isAdmin) return
    try {
      const stored = window.sessionStorage.getItem('itu_unlocked_pages')
      if (stored) {
        setUnlockedMap(JSON.parse(stored))
      }
    } catch {
      // ignore
    }
  }, [isAdmin])

  // Fetch protected paths for limited admins
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    async function fetchPaths() {
      setLoadingPaths(true)
      try {
        const res = await fetch('/api/admin/settings/page-passwords')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && data.protectedPaths) {
            setProtectedPaths(data.protectedPaths)
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingPaths(false)
      }
    }
    void fetchPaths()
    return () => {
      cancelled = true
    }
  }, [isAdmin, pathname]) // Re-fetch on pathname changes just in case settings were updated

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

  const matchedPrefix = findProtectedPrefix(pathname, protectedPaths)
  if (!matchedPrefix) {
    return <>{children}</>
  }

  // Check if current prefix is unlocked and within 20 mins
  const unlockTime = unlockedMap[matchedPrefix]
  const isUnlocked = unlockTime && Date.now() - unlockTime < UNLOCK_DURATION

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
        const nextMap = { ...unlockedMap, [matchedPrefix]: Date.now() }
        setUnlockedMap(nextMap)
        window.sessionStorage.setItem('itu_unlocked_pages', JSON.stringify(nextMap))
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
            This section requires a password to access. Once verified, it will remain unlocked for 20 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive border border-destructive/20 animate-shake">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
