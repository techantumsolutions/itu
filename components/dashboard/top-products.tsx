"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, ChevronRight } from "lucide-react"

type TopProduct = {
  product_name: string
  operator_name: string
  orders: number
  revenue: number
  currency?: string
}

export function TopProducts() {
  const [products, setProducts] = useState<TopProduct[]>([])

  useEffect(() => {
    void fetch('/api/admin/dashboard', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const rows = Array.isArray(data?.topProducts) ? data.topProducts : []
        setProducts(rows)
      })
      .catch(() => setProducts([]))
  }, [])

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount)
  }

  return (
    <Card className="rounded-2xl border-border/70 shadow-elevated-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-semibold tracking-tight">Top Sales Product</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Top-selling Product Line Analysis
            </p>
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
              <DropdownMenuItem>Share</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {products.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No product sales yet.</p>
        ) : null}
        {products.slice(0, 4).map((product) => (
          <div
            key={`${product.product_name}-${product.operator_name}`}
            className="flex items-center gap-3 py-2"
          >
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                {product.product_name.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{product.product_name}</p>
              <p className="text-xs text-primary">{formatCurrency(Number(product.revenue) || 0, product.currency || 'USD')}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-medium text-primary">
                {Number(product.orders) || 0} Sold
              </span>
            </div>
          </div>
        ))}
        
        <Button 
          variant="outline" 
          className="w-full mt-2 gap-2"
        >
          Show More
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
