'use client'

import { useState, useEffect } from 'react'
import { Wallet, Plus, ArrowUpRight, ArrowDownLeft, History, CreditCard, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWalletStore } from '@/lib/stores'
import { cn } from '@/lib/utils'

const quickAmounts = [10, 25, 50, 100, 250, 500]

export default function AccountWalletPage() {
  const { balance, transactions, topUp, fetchBalance, fetchTransactions, isLoading } = useWalletStore()
  const [topUpAmount, setTopUpAmount] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    void fetchBalance()
    void fetchTransactions()
  }, [fetchBalance, fetchTransactions])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const amount = parseFloat(topUpAmount)
    if (!amount || amount <= 0 || isNaN(amount)) {
      setError('Please enter a valid positive amount.')
      return
    }
    const ok = await topUp(amount)
    if (ok) {
      setSuccess(`Successfully added ${formatCurrency(amount)} to your wallet!`)
      setTopUpAmount('')
    } else {
      setError('Failed to process top-up. Please try again.')
    }
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'topup':
        return <Plus className="h-4 w-4 text-emerald-600" />
      case 'recharge':
        return <ArrowUpRight className="h-4 w-4 text-blue-600" />
      case 'refund':
        return <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
      default:
        return <RefreshCw className="h-4 w-4 text-neutral-500" />
    }
  }

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'topup':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Top-up</Badge>
      case 'recharge':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Recharge</Badge>
      case 'refund':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Refund</Badge>
      case 'commission':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Commission</Badge>
      default:
        return <Badge variant="outline">Transaction</Badge>
    }
  }

  const getAmountColor = (type: string) => {
    switch (type) {
      case 'topup':
      case 'refund':
      case 'commission':
        return 'text-emerald-600'
      case 'recharge':
        return 'text-red-600'
      default:
        return ''
    }
  }

  const getAmountPrefix = (type: string) => {
    switch (type) {
      case 'topup':
      case 'refund':
      case 'commission':
        return '+'
      case 'recharge':
        return '-'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Wallet</h1>
        <p className="text-muted-foreground">Manage your wallet balance and top up funds</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Wallet Balance Card */}
        <Card className="md:col-span-2 bg-gradient-to-br from-neutral-900 to-neutral-800 text-white overflow-hidden rounded-2xl shadow-lg border-none">
          <CardContent className="p-6 flex flex-col justify-between h-full min-h-[200px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-neutral-400 text-sm font-medium">Available Balance</p>
                <p className="text-5xl font-black mt-2 tracking-tight">{formatCurrency(balance)}</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400 shadow-inner">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
            <div className="text-neutral-400 text-xs mt-4">
              Last synchronized: {formatDate(new Date().toISOString())}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="flex flex-col gap-4">
          <Card className="rounded-2xl border-neutral-200/60 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <ArrowDownLeft className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Top-Ups</p>
                <p className="text-xl font-bold text-neutral-950">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.type === 'topup' || t.type === 'refund')
                      .reduce((acc, t) => acc + t.amount, 0)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-neutral-200/60 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Spent</p>
                <p className="text-xl font-bold text-neutral-950">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.type === 'recharge')
                      .reduce((acc, t) => acc + t.amount, 0)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Top Up Form */}
        <Card className="rounded-2xl border-neutral-200/60 shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Top Up Wallet</CardTitle>
            <CardDescription>Add funds using simulated payment processing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                {success}
              </div>
            )}

            <form onSubmit={handleTopUpSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topup-amount">Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 font-semibold">$</span>
                  <Input
                    id="topup-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="0.00"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className="pl-7 h-10 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quick Select</Label>
                <div className="grid grid-cols-3 gap-2">
                  {quickAmounts.map((amount) => (
                    <Button
                      key={amount}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTopUpAmount(amount.toString())
                        setError('')
                        setSuccess('')
                      }}
                      className={cn(
                        'rounded-lg text-xs font-semibold',
                        topUpAmount === amount.toString() && 'bg-neutral-900 text-white hover:bg-neutral-800'
                      )}
                    >
                      ${amount}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-10 rounded-xl bg-neutral-900 text-white font-semibold hover:bg-neutral-800"
                disabled={isLoading || !topUpAmount}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Add Funds'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Transaction Ledger */}
        <Card className="md:col-span-2 rounded-2xl border-neutral-200/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Transaction History</CardTitle>
                <CardDescription>Records of your top-ups and spending</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[350px] overflow-y-auto border-t border-neutral-100">
              <Table>
                <TableHeader className="bg-neutral-50/50 sticky top-0 backdrop-blur-md">
                  <TableRow>
                    <TableHead className="w-[140px] pl-6">Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right pr-6">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-neutral-400">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((t) => (
                      <TableRow key={t.id} className="hover:bg-neutral-50/40">
                        <TableCell className="pl-6 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-neutral-100 flex items-center justify-center">
                              {getTransactionIcon(t.type)}
                            </div>
                            {getTransactionBadge(t.type)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-neutral-800">
                          {t.description}
                        </TableCell>
                        <TableCell className="text-xs text-neutral-500">
                          {formatDate(t.createdAt)}
                        </TableCell>
                        <TableCell className={cn('text-right pr-6 font-bold text-sm', getAmountColor(t.type))}>
                          {getAmountPrefix(t.type)}
                          {formatCurrency(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
