'use client'

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { AdminAuthGate } from '@/components/admin-auth-gate'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminAuthGate>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden bg-mesh bg-background">
          <DashboardHeader title="Sales Dashboard" />
          <div className="flex w-full min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-7 xl:px-10 2xl:px-14">
            <div className="w-full min-w-0">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AdminAuthGate>
  )
}
