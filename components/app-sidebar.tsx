'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores'
import { isClientSuperAdmin } from '@/lib/tickets/auth-headers'
import { clientHasAdminFeature } from '@/lib/auth/client-features'
import type { AdminFeatureKey } from '@/lib/auth/admin-features'
import {
  LayoutDashboard,
  Package,
  BarChart3,
  LineChart,
  Users,
  UserCog,
  Settings,
  HelpCircle,
  LogOut,
  Globe,
  Route,
  FileEdit,
  MessageSquare,
  Megaphone,
  FileSpreadsheet,
  ChartNoAxesCombined,
  PlugZap,
  Cog,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'


import { cn } from '@/lib/utils'
import { ItuLogoMark } from '@/components/itu-logo-mark'

const mainMenuItems: {
  title: string
  url: string
  icon: typeof LayoutDashboard
  feature: AdminFeatureKey
  superAdminOnly?: boolean
  children?: { title: string; url: string }[]
}[] = [
    {
      title: 'Dashboard',
      url: '/admin',
      icon: LayoutDashboard,
      feature: 'dashboard',
    },
    {
      title: 'Admin users',
      url: '/admin/staff',
      icon: UserCog,
      feature: 'dashboard',
      superAdminOnly: true,
    },
    {
      title: 'Providers',
      url: '/admin/providers',
      icon: Globe,
      feature: 'providers',
    },
    {
      title: 'Operators',
      url: '/admin/integrations/operators',
      icon: PlugZap,
      feature: 'integrations',
    },
    {
      title: 'Plans',
      url: '/admin/products',
      icon: Package,
      feature: 'products',
    },
    {
      title: 'LCR Engine',
      url: '/admin/routing/lcr-engine',
      icon: Cog,
      feature: 'routing',
    },
    {
      title: 'Routing',
      url: '/admin/routing/rules',
      icon: Route,
      feature: 'routing',
      children: [
        { title: 'Routing Rules', url: '/admin/routing/rules' },
        { title: 'Routing Logs', url: '/admin/routing/logs' },
      ],
    },
    {
      title: 'Website CMS',
      url: '/admin/cms',
      icon: FileEdit,
      feature: 'cms',
    },
    {
      title: 'Customers',
      url: '/admin/customers',
      icon: Users,
      feature: 'customers',
    },
    {
      title: 'Support Tickets',
      url: '/admin/support-tickets',
      icon: MessageSquare,
      feature: 'tickets',
    },
    {
      title: 'Ads Manager',
      url: '/admin/ads',
      icon: Megaphone,
      feature: 'ads',
    },
    {
      title: 'Reconciliation',
      url: '/admin/reconciliation',
      icon: FileSpreadsheet,
      feature: 'reconciliation',
    },
    {
      title: 'Reports & Analytics',
      url: '/admin/reports',
      icon: ChartNoAxesCombined,
      feature: 'reports',
    },
    {
      title: 'Analytics',
      url: '/admin/analytics',
      icon: LineChart,
      feature: 'analytics',
    },
    {
      title: 'Statistics',
      url: '/admin/statistics',
      icon: BarChart3,
      feature: 'statistics',
    },
  ]

const helpCenterItems: {
  title: string
  url: string
  icon: typeof Settings
  feature: AdminFeatureKey
}[] = [
    {
      title: 'Settings',
      url: '/admin/settings',
      icon: Settings,
      feature: 'settings',
    },
    {
      title: 'Help Center',
      url: '/admin/help',
      icon: HelpCircle,
      feature: 'help',
    },
  ]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleSignOut = () => {
    const isAdmin = user?.role === 'admin'
    logout()
    if (isAdmin) {
      router.push('/admin-user/login')
    } else {
      router.push('/admin/login')
    }
  }

  const isSuperAdmin = isClientSuperAdmin(user)

  const visibleMain = mainMenuItems.filter((item) => {
    if (!user) return false
    if (item.superAdminOnly) return isSuperAdmin
    return clientHasAdminFeature(user, item.feature)
  })

  const visibleHelp = helpCenterItems.filter((item) => user && clientHasAdminFeature(user, item.feature))

  return (
    <Sidebar collapsible="icon" className="border-r border-border/70 bg-sidebar shadow-elevated-sm">
      <SidebarHeader className="border-b border-sidebar-border/80 p-1.5">
        <Link href="/admin" className="flex items-center gap-3 rounded-xl px-1 py-0.5 transition-colors hover:bg-sidebar-accent/60">
          <ItuLogoMark className="rounded-xl" />
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Console</p>
            <span className="font-title-logo text-lg font-semibold tracking-tight">ITU</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-2 px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain.map((item) => {
                const isActive =
                  pathname === item.url ||
                  (item.url !== '/admin' && pathname.startsWith(item.url)) ||
                  (item.children?.some((child) => pathname === child.url || pathname.startsWith(`${child.url}/`)) ?? false)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className={cn(
                        'rounded-xl border border-transparent transition-all duration-200',
                        isActive &&
                        'border-primary/15 bg-primary/10 font-semibold text-primary shadow-elevated-sm ',
                      )}
                    >
                      <Link href={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.children?.length ? (
                      <SidebarMenuSub>
                        {item.children.map((child) => {
                          const childActive = pathname === child.url || pathname.startsWith(`${child.url}/`)
                          return (
                            <SidebarMenuSubItem key={child.url}>
                              <SidebarMenuSubButton asChild isActive={childActive}>
                                <Link href={child.url}>{child.title}</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Help Center
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleHelp.map((item) => {
                const isActive = pathname === item.url
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className={cn(
                        'rounded-xl border border-transparent transition-all duration-200',
                        isActive &&
                        'border-primary/15 bg-primary/10 font-semibold text-primary shadow-elevated-sm ',
                      )}
                    >
                      <Link href={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80 p-2">
        {user ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sign out"
                className="rounded-xl text-muted-foreground hover:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="size-4" />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  )
}
