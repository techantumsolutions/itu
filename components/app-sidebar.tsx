'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores'
import { clientHasAdminPermission } from '@/lib/auth/client-features'
import type { AdminPermissionKey } from '@/lib/auth/admin-permissions'
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
  History,
  Wallet,
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
  viewPermission: AdminPermissionKey
  children?: { title: string; url: string; viewPermission?: AdminPermissionKey }[]
}[] = [
  { title: 'Dashboard', url: '/admin', icon: LayoutDashboard, viewPermission: 'dashboard.view' },
  { title: 'Transactions', url: '/admin/transactions', icon: FileSpreadsheet, viewPermission: 'transactions.view' },
  { title: 'Admin users', url: '/admin/staff', icon: UserCog, viewPermission: 'admin_users.view' },
  { title: 'Providers', url: '/admin/providers', icon: Globe, viewPermission: 'providers.view' },
  { title: 'Operators', url: '/admin/integrations/operators', icon: PlugZap, viewPermission: 'operators.view' },
  { title: 'Catalog History', url: '/admin/catalog/history', icon: History, viewPermission: 'operators.view' },
  { title: 'Plans', url: '/admin/products', icon: Package, viewPermission: 'plans.view' },
  { title: 'LCR Engine', url: '/admin/routing/lcr-engine', icon: Cog, viewPermission: 'lcr.view' },
  {
    title: 'Routing',
    url: '/admin/routing/rules',
    icon: Route,
    viewPermission: 'routing_rules.view',
    children: [
      { title: 'Routing Rules', url: '/admin/routing/rules', viewPermission: 'routing_rules.view' },
      { title: 'Routing Logs', url: '/admin/routing/logs', viewPermission: 'routing_logs.view' },
    ],
  },
  // { title: 'Wallet', url: '/admin/wallet', icon: Wallet, viewPermission: 'wallet.view' },
  { title: 'Website CMS', url: '/admin/cms', icon: FileEdit, viewPermission: 'cms.view' },
  { title: 'Customers', url: '/admin/customers', icon: Users, viewPermission: 'customers.view' },
  { title: 'Support Tickets', url: '/admin/support-tickets', icon: MessageSquare, viewPermission: 'tickets.view' },
  { title: 'Ads Manager', url: '/admin/ads', icon: Megaphone, viewPermission: 'ads.view' },
  { title: 'Reconciliation', url: '/admin/reconciliation', icon: FileSpreadsheet, viewPermission: 'reconciliation.view' },
  { title: 'Reports & Analytics', url: '/admin/reports', icon: ChartNoAxesCombined, viewPermission: 'reports.view' },
  { title: 'Analytics', url: '/admin/analytics', icon: LineChart, viewPermission: 'analytics.view' },
  { title: 'Statistics', url: '/admin/statistics', icon: BarChart3, viewPermission: 'statistics.view' },
]

const helpCenterItems: {
  title: string
  url: string
  icon: typeof Settings
  viewPermission: AdminPermissionKey
}[] = [
  { title: 'Settings', url: '/admin/settings', icon: Settings, viewPermission: 'settings.view' },
  { title: 'Help Center', url: '/admin/help', icon: HelpCircle, viewPermission: 'help.view' },
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

  const visibleMain = mainMenuItems.filter((item) => user && clientHasAdminPermission(user, item.viewPermission))

  const visibleHelp = helpCenterItems.filter(
    (item) => user && clientHasAdminPermission(user, item.viewPermission),
  )

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
                const visibleChildren = (item.children ?? []).filter(
                  (child) => !child.viewPermission || clientHasAdminPermission(user, child.viewPermission),
                )
                const isActive =
                  pathname === item.url ||
                  (item.url !== '/admin' && pathname.startsWith(item.url)) ||
                  (visibleChildren.some((child) => pathname === child.url || pathname.startsWith(`${child.url}/`)) ?? false)
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
                    {visibleChildren.length ? (
                      <SidebarMenuSub>
                        {visibleChildren.map((child) => {
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
