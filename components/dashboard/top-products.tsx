'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import type { DashboardTopProduct } from '@/lib/admin/dashboard-metrics'

type TopProductsProps = {
  products: DashboardTopProduct[]
  reportingCurrency: string
}

export function TopProducts({ products, reportingCurrency }: TopProductsProps) {
  const formatCurrency = (amount: number, currency = reportingCurrency) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)

  return (
    <Card className="rounded-2xl border-border/70 shadow-elevated-sm">
      <CardHeader className="border-b border-border/60 pb-1" style={{ paddingBottom: '0.125rem' }}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-semibold tracking-tight">Top Sales Plans</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">By margin on completed recharges</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem>View Details</DropdownMenuItem>
              <DropdownMenuItem>Export Report</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {products.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No completed recharges yet.</p>
        ) : null}
        {products.slice(0, 3).map((product) => (
          <div
            key={`${product.plan_id ?? product.product_name}-${product.operator_name}`}
            className="flex items-center gap-3 py-2"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <span className="text-xs font-medium text-muted-foreground">
                {product.product_name.charAt(0)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{product.product_name}</p>
              <p className="truncate text-xs text-muted-foreground">{product.operator_name}</p>
              <p className="text-xs text-primary">
                Margin {formatCurrency(product.margin, product.currency)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-sm font-medium text-primary">{product.orders} sold</span>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(product.revenue, product.currency)} paid
              </p>
            </div>
          </div>
        ))}

        {products.length > 2 ? (
          <Button variant="outline" className="mt-1 w-full gap-2">
            Show More
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
