'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores'
import { cn } from '@/lib/utils'
import { User, History, Wallet, Gift, Settings, Shield, MessageSquare } from 'lucide-react'

const accountNavItems = [
  { href: '/account', label: 'Profile', icon: User },
  { href: '/account/tickets', label: 'My Support Tickets', icon: MessageSquare },
  { href: '/account/transactions', label: 'Transactions', icon: History },
  { href: '/account/wallet', label: 'Wallet', icon: Wallet },
  { href: '/account/rewards', label: 'Rewards', icon: Gift },
  { href: '/account/security', label: 'Security', icon: Shield },
  { href: '/account/settings', label: 'Settings', icon: Settings },
]

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const isRegisteredWithEmail = user?.is_registered_with_email ?? false
  const [isStoreHydrated, setIsStoreHydrated] = useState(false)

  useEffect(() => {
    const p = useAuthStore.persist
    if (p?.hasHydrated?.()) {
      setIsStoreHydrated(true)
    } else {
      const unsub = p?.onFinishHydration?.(() => {
        setIsStoreHydrated(true)
      })
      return () => unsub?.()
    }
  }, [])

  useEffect(() => {
    if (!isStoreHydrated) return

    if (!isLoading && !isAuthenticated) {
      router.push(`/login?redirect=${pathname}`)
      return
    }

    if (!isLoading && isAuthenticated && !isRegisteredWithEmail) {
      const allowedPaths = ['/account', '/account/tickets', '/account/transactions', '/account/wallet']
      const isAllowed = allowedPaths.some(path => pathname === path || pathname.startsWith(path + '/'))
      if (!isAllowed) {
        router.push('/account')
      }
    }
  }, [isStoreHydrated, isAuthenticated, isRegisteredWithEmail, isLoading, router, pathname])

  if (!isStoreHydrated || !isAuthenticated) {
    return (
      <div className="w-full px-4 py-12 sm:px-6">
        <div className="flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  const filteredNavItems = accountNavItems.filter((item) => {
    if (!isRegisteredWithEmail) {
      return ['/account', '/account/tickets', '/account/transactions', '/account/wallet'].includes(item.href)
    }
    return true
  })

  return (
    <div className="border-b border-border/60 bg-mesh">
      <div className="w-full px-4 py-10 md:py-12 sm:px-6">
        <div className="grid w-full gap-8 lg:grid-cols-[260px_1fr] lg:gap-10">
          <aside className="h-fit rounded-2xl border border-border/70 bg-card/90 p-4 shadow-elevated-sm backdrop-blur-sm lg:sticky lg:top-24">
            <h2 className="mb-4 px-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">My Account</h2>
            <nav className="flex flex-col gap-1">
              {filteredNavItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'border-primary/15 bg-primary/10 text-primary shadow-elevated-sm'
                        : 'text-muted-foreground hover:border-border/60 hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  )
}
