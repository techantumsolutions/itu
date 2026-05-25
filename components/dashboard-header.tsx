'use client'

import { useRouter } from 'next/navigation'
import { Search, Mail, Bell, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useAuthStore, useUIStore } from '@/lib/stores'
import { Badge } from '@/components/ui/badge'

interface DashboardHeaderProps {
  title: string
}

export function DashboardHeader({ title }: DashboardHeaderProps) {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const { setCommandOpen } = useUIStore()

  const handleSignOut = () => {
    logout()
    router.push('/admin/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-card/90 px-4 shadow-elevated-sm backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 lg:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden rounded-lg border border-border/60" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Overview</p>
          <h1 className="text-lg font-semibold leading-tight tracking-tight md:text-xl">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search"
            className="h-10 w-64 rounded-xl border-border/70 bg-muted/40 pl-9 pr-12 shadow-none"
            onClick={() => setCommandOpen(true)}
            readOnly
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
            <span className="text-xs">Cmd</span>+K
          </kbd>
        </div>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative rounded-xl text-muted-foreground hover:text-foreground">
          <Mail className="size-5" />
          <Badge className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full p-0 text-[10px] shadow-elevated-sm">
            3
          </Badge>
        </Button>

        <Button variant="ghost" size="icon" className="relative rounded-xl text-muted-foreground hover:text-foreground">
          <Bell className="size-5" />
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive shadow-sm" />
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 rounded-xl border-border/70 px-2 hover:bg-muted/60">
              <Avatar className="size-9 ring-2 ring-border/60">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="bg-muted">
                  {user?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className="size-4 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-1 shadow-elevated">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault()
                handleSignOut()
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
