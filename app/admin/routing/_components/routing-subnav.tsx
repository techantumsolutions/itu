'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/admin/routing/lcr-engine', label: 'LCR Engine' },
  { href: '/admin/routing/rules', label: 'Routing Rules' },
  { href: '/admin/routing/logs', label: 'Routing Logs' },
] as const

export function RoutingSubnav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-3">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
