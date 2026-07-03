'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Mail,
  Bell,
  ChevronDown,
  User,
  Shield,
  AlertTriangle,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
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

  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  const isSuperAdmin = user?.role === 'super_admin'

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e)
    }
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) return

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 15000)
    return () => clearInterval(interval)
  }, [isSuperAdmin, fetchNotifications])

  const handleMarkAsRead = async (id: string, type: string) => {
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        fetchNotifications()
      }
    } catch (e) {
      console.error('Failed to mark notification as read:', e)
    }

    // Redirect based on type
    if (type === 'user_registration') {
      router.push('/admin/customers')
    } else if (type === 'admin_password_set' || type === 'admin_account_frozen') {
      router.push('/admin/staff')
    } else if (type === 'recharge_failed_after_payment') {
      router.push('/admin/transactions')
    } else if (type === 'support_ticket_raised') {
      router.push('/admin/support-tickets')
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllAsRead: true }),
      })
      if (res.ok) {
        fetchNotifications()
      }
    } catch (e) {
      console.error('Failed to mark all as read:', e)
    }
  }

  const handleSignOut = () => {
    const isAdmin = user?.role === 'admin'
    logout()
    if (isAdmin) {
      router.push('/admin-user/login')
    } else {
      router.push('/admin/login')
    }
  }

  // Only display unread notifications
  const unreadNotifications = notifications.filter((item) => !item.is_read)

  return (
    <header className="sticky top-0 z-30 flex h-16 py-10 items-center justify-between border-b border-border/70 bg-card/90 px-4 shadow-elevated-sm backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 lg:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden rounded-lg border border-border/60" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Overview</p>
          <h1 className="text-lg font-semibold leading-tight tracking-tight md:text-xl">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search */}
        {/* <div className="relative hidden md:block">
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
        </div> */}

        {/* Notifications */}
        {/* <Button variant="ghost" size="icon" className="relative rounded-xl text-muted-foreground hover:text-foreground">
          <Mail className="size-5" />
          <Badge className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full p-0 text-[10px] shadow-elevated-sm">
            3
          </Badge>
        </Button> */}

        {isSuperAdmin && (
          <div
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className="relative"
          >
            <Button variant="ghost" size="icon" className="relative rounded-xl text-muted-foreground hover:text-foreground animate-none">
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-0 -top-1 flex size-5 items-center justify-center rounded-full p-0 text-[10px] shadow-elevated-sm bg-destructive text-destructive-foreground">
                  {unreadCount}
                </Badge>
              )}
            </Button>
            {open && (
              <div className="absolute right-0 top-full pt-2 w-80 z-50">
                <div className="rounded-2xl p-2 shadow-elevated bg-card border border-border">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="font-semibold text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-primary hover:text-primary-hover px-2 py-1 rounded-lg"
                        onClick={(e) => {
                          e.preventDefault()
                          handleMarkAllAsRead()
                        }}
                      >
                        Mark all as read
                      </Button>
                    )}
                  </div>
                  <div className="my-1 border-b border-border/60" />
                  <div className="max-h-[360px] overflow-y-auto space-y-1 p-1">
                    {unreadNotifications.length === 0 ? (
                      <div className="text-center py-6 text-xs text-muted-foreground">
                        No notifications
                      </div>
                    ) : (
                      unreadNotifications.map((item) => {
                        const iconColor =
                          item.type === 'admin_account_frozen'
                            ? 'text-destructive bg-destructive/10'
                            : item.type === 'recharge_failed_after_payment'
                              ? 'text-orange-500 bg-orange-500/10'
                              : item.type === 'support_ticket_raised'
                                ? 'text-purple-500 bg-purple-500/10'
                                : item.type === 'admin_password_set'
                                  ? 'text-blue-500 bg-blue-500/10'
                                  : 'text-green-500 bg-green-500/10'

                        const Icon =
                          item.type === 'admin_account_frozen'
                            ? ShieldAlert
                            : item.type === 'recharge_failed_after_payment'
                              ? AlertTriangle
                              : item.type === 'support_ticket_raised'
                                ? MessageSquare
                                : item.type === 'admin_password_set'
                                  ? Shield
                                  : User

                        return (
                          <div
                            key={item.id}
                            className="flex gap-3 items-start p-2.5 rounded-xl transition-all cursor-pointer hover:bg-muted/55 focus:bg-muted/55 outline-none text-foreground"
                            onClick={() => handleMarkAsRead(item.id, item.type)}
                          >
                            <div className={`p-2 rounded-xl shrink-0 ${iconColor}`}>
                              <Icon className="size-4" />
                            </div>
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="text-xs text-foreground truncate">{item.title}</p>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {item.message}
                              </p>
                              <p className="text-[10px] text-muted-foreground/85">
                                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                              </p>
                            </div>
                            {!item.is_read && (
                              <span className="size-2 rounded-full bg-primary shrink-0 self-center" />
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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
