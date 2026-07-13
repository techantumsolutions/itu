'use client'

import { useState, useEffect, useMemo } from 'react'
import { Wallet, Plus, ArrowUpRight, ArrowDownLeft, History, CreditCard, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWalletStore, useAuthStore } from '@/lib/stores'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const quickAmounts = [10, 25, 50, 100, 250, 500]

export default function AccountWalletPage() {
  const { balance, currency, transactions, wallets, topUp, fetchBalance, fetchTransactions, isLoading } = useWalletStore()
  const { user } = useAuthStore()
  const [topUpAmount, setTopUpAmount] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [rewardPoints, setRewardPoints] = useState(user?.rewardPoints || 0)
  const [pointsWorth, setPointsWorth] = useState(0)
  const [selectedCurrency, setSelectedCurrency] = useState<string>('')

  const currentCurrency = selectedCurrency || currency
  const walletList = wallets || []

  const refundTxns = useMemo(() => {
    return (transactions || []).filter((t) => t.type === 'refund')
  }, [transactions])

  const displayedBalance = useMemo(() => {
    if (walletList.length > 0) {
      const match = walletList.find((w) => w.currency === currentCurrency)
      if (match) return match.balance
    }
    return balance
  }, [walletList, currentCurrency, balance])

  useEffect(() => {
    void fetchBalance()
    void fetchTransactions()
  }, [fetchBalance, fetchTransactions])

  useEffect(() => {
    async function fetchPoints() {
      try {
        const res = await fetch('/api/account/rewards/history')
        if (res.ok) {
          const data = await res.json()
          setRewardPoints(data.balance ?? 0)
          setPointsWorth(data.balanceWorth ?? 0)
        }
      } catch (e) {
        console.error('Failed to fetch rewards info:', e)
      }
    }
    void fetchPoints()
  }, [])

  const formatCurrency = (amount: number, currencyCode: string = 'USD') => {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
    return amount > 0 ? `${formatted} ${currencyCode}` : formatted
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
    setError('Top-up is temporarily disabled.')
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'topup':
        return <Plus className="h-4 w-4 text-emerald-600" />
      case 'recharge':
      case 'payment':
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
      case 'payment':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Payment</Badge>
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
      case 'payment':
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
      case 'payment':
        return '-'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Wallet</h1>
        <p className="text-muted-foreground">View your wallet balance and refund history</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Wallet Balance Card */}
        <Card className="md:col-span-3 bg-gradient-to-br from-neutral-900 to-neutral-800 text-white overflow-hidden rounded-2xl shadow-lg border-none">
          <CardContent className="p-6 flex flex-col justify-between h-full min-h-[200px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-neutral-400 text-sm font-medium">Available Balance</p>
                <p className="text-5xl font-black mt-2 tracking-tight">{formatCurrency(displayedBalance, currentCurrency)}</p>
              </div>
              
              <div className="flex items-center gap-3">
                {walletList.length > 1 && (
                  <div className="flex flex-col items-end gap-1.5">
                    <Label className="text-xs text-neutral-400 font-normal">Select Currency</Label>
                    <Select value={currentCurrency} onValueChange={setSelectedCurrency}>
                      <SelectTrigger className="w-[110px] h-9 bg-white/10 border-white/20 text-white rounded-xl focus:ring-amber-500">
                        <SelectValue placeholder={currentCurrency} />
                      </SelectTrigger>
                      <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                        {walletList.map((w) => (
                          <SelectItem key={w.currency} value={w.currency} className="hover:bg-neutral-800 focus:bg-neutral-800 focus:text-white">
                            {w.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400 shadow-inner">
                  <Wallet className="h-6 w-6" />
                </div>
              </div>
            </div>
            <div className="text-neutral-400 text-xs mt-4">
              Last synchronized: {formatDate(new Date().toISOString())}
            </div>
          </CardContent>
        </Card>
      </div>

      {refundTxns.length > 0 && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Transaction Ledger */}
          <Card className="md:col-span-3 rounded-2xl border-neutral-200/60 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold">Refund History</CardTitle>
                  <CardDescription>Records of your refunded transactions</CardDescription>
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
                    {refundTxns.map((t) => (
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
                          {formatCurrency(t.amount, t.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
