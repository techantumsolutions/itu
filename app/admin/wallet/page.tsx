"use client"

import { useState } from "react"
import { useAuthStore } from "@/lib/stores"
import { clientHasAdminPermission } from "@/lib/auth/client-features"
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  CreditCard,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useWalletStore } from "@/lib/stores"
import { cn } from "@/lib/utils"

const quickAmounts = [10, 25, 50, 100, 250, 500]

export default function WalletPage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user && clientHasAdminPermission(user, 'wallet.manage')
  const { balance, transactions, topUp, isLoading } = useWalletStore()
  const [topUpAmount, setTopUpAmount] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount)
    if (amount > 0) {
      await topUp(amount)
      setTopUpAmount("")
      setIsDialogOpen(false)
    }
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "topup":
        return <Plus className="h-4 w-4 text-success" />
      case "recharge":
      case "payment":
        return <ArrowUpRight className="h-4 w-4 text-primary" />
      case "refund":
        return <ArrowDownLeft className="h-4 w-4 text-success" />
      default:
        return <RefreshCw className="h-4 w-4" />
    }
  }

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case "topup":
        return <Badge variant="outline" className="bg-success/10 text-success border-success/20">Top-up</Badge>
      case "recharge":
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Recharge</Badge>
      case "payment":
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Payment</Badge>
      case "refund":
        return <Badge variant="outline" className="bg-success/10 text-success border-success/20">Refund</Badge>
      case "commission":
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Commission</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getAmountColor = (type: string) => {
    switch (type) {
      case "topup":
      case "refund":
      case "commission":
        return "text-success"
      case "recharge":
      case "payment":
        return "text-destructive"
      default:
        return ""
    }
  }

  const getAmountPrefix = (type: string) => {
    switch (type) {
      case "topup":
      case "refund":
      case "commission":
        return "+"
      case "recharge":
      case "payment":
        return "-"
      default:
        return ""
    }
  }

  return (
    <div className="space-y-6">
      {/* Wallet Balance Card */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-primary-foreground/80 text-sm font-medium">Available Balance</p>
                <p className="text-4xl font-bold mt-2">{formatCurrency(balance)}</p>
                <p className="text-primary-foreground/60 text-sm mt-2">
                  Last updated: {formatDate(new Date().toISOString())}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              {canManage ? (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
                    <Plus className="h-4 w-4 mr-2" />
                    Top Up
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Top Up Wallet</DialogTitle>
                    <DialogDescription>
                      Add funds to your wallet to make recharges.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount (USD)</Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="Enter amount"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quick Select</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {quickAmounts.map((amount) => (
                          <Button
                            key={amount}
                            variant="outline"
                            size="sm"
                            onClick={() => setTopUpAmount(amount.toString())}
                            className={cn(
                              topUpAmount === amount.toString() && "bg-primary text-primary-foreground"
                            )}
                          >
                            ${amount}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleTopUp} disabled={isLoading || !topUpAmount}>
                      {isLoading ? "Processing..." : `Add ${topUpAmount ? formatCurrency(parseFloat(topUpAmount)) : ""}`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              ) : null}
              <Button variant="outline" className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20">
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <ArrowDownLeft className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Added</p>
                <p className="text-xl font-bold">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.type === "topup" || t.type === "refund")
                      .reduce((acc, t) => acc + t.amount, 0)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-xl font-bold">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.type === "recharge" || t.type === "payment")
                      .reduce((acc, t) => acc + t.amount, 0)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Transaction History</CardTitle>
            <Button variant="outline" size="sm">
              <CreditCard className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          {getTransactionIcon(transaction.type)}
                        </div>
                        {getTransactionBadge(transaction.type)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {transaction.description}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(transaction.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          transaction.status === "completed" && "bg-success/10 text-success border-success/20",
                          transaction.status === "pending" && "bg-warning/10 text-warning border-warning/20",
                          transaction.status === "failed" && "bg-destructive/10 text-destructive border-destructive/20"
                        )}
                      >
                        {transaction.status}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-bold ${getAmountColor(transaction.type)}`}>
                      {getAmountPrefix(transaction.type)}
                      {formatCurrency(transaction.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
