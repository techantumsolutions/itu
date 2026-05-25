"use client"

import { useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Settings2, SlidersHorizontal, MoreHorizontal, ArrowUpDown } from "lucide-react"
import type { Transaction } from "@/lib/types"

type SortField = "product" | "purchaseNo" | "date" | "amount"
type SortDirection = "asc" | "desc"

export function TransactionsTable() {
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    void fetch('/api/admin/transactions?limit=10', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setTransactions(Array.isArray(data?.transactions) ? data.transactions : []))
      .catch(() => setTransactions([]))
  }, [])

  const sortedTransactions = [...transactions].sort((a, b) => {
    let comparison = 0
    switch (sortField) {
      case "product":
        comparison = (a.description || "").localeCompare(b.description || "")
        break
      case "purchaseNo":
        comparison = (a.metadata?.orderId || a.id).localeCompare(b.metadata?.orderId || b.id)
        break
      case "date":
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case "amount":
        comparison = a.amount - b.amount
        break
    }
    return sortDirection === "asc" ? comparison : -comparison
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  const getStatusColor = (status: Transaction["status"]) => {
    switch (status) {
      case "completed":
        return "text-success"
      case "pending":
        return "text-warning"
      case "failed":
        return "text-destructive"
      default:
        return "text-muted-foreground"
    }
  }

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {children}
      <ArrowUpDown className="h-3.5 w-3.5" />
    </button>
  )

  return (
    <Card className="rounded-2xl border-border/70 shadow-elevated-sm">
      <CardHeader className="border-b border-border/60 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl font-semibold tracking-tight">Recent Transaction</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Latest Transaction Summary Report</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 rounded-xl">
              <Settings2 className="h-4 w-4" />
              View Setting
            </Button>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl">
              <SlidersHorizontal className="h-4 w-4" />
              Filter
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem>Export CSV</DropdownMenuItem>
                <DropdownMenuItem>Print Report</DropdownMenuItem>
                <DropdownMenuItem>View All</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead>
                <SortableHeader field="product">Product</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader field="purchaseNo">Purchase No</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader field="date">Date</SortableHeader>
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader field="amount">Amount</SortableHeader>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No transactions yet.
                </TableCell>
              </TableRow>
            ) : null}
            {sortedTransactions.slice(0, 5).map((transaction) => {
              const productName = transaction.description || "Transaction"
              const purchaseNo = transaction.metadata?.orderId || transaction.id
              
              return (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/50">
                        <span className="text-xs font-medium text-muted-foreground">
                          {productName.charAt(0)}
                        </span>
                      </div>
                      <span>{productName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {purchaseNo}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(transaction.createdAt)}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${getStatusColor(transaction.status)}`}>
                    {formatCurrency(transaction.amount)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
