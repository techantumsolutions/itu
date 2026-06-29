'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/lib/stores'
import { Gift, Sparkles, Clock, ArrowRight, Info, Coins, Phone, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type LedgerEntry = {
  id: string
  points: number
  reason: string
  metadata: {
    rule_id?: string
    trigger?: string
    scope?: Record<string, unknown>
    all_qualified?: Array<{ rule_id: string; name: string; points: number }>
  }
  created_at: string
  transaction_id: string | null
  transactions: {
    id: string
    amount: number
    currency: string
    status: string
    description: string
    metadata: {
      mobile_number?: string
      operator_id?: string
      plan_id?: string
      country_id?: string
      [key: string]: unknown
    }
  } | null
}

export default function RewardsPage() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [pointValue, setPointValue] = useState(0.01)
  const [balance, setBalance] = useState(0)
  const [balanceWorth, setBalanceWorth] = useState(0)
  const [loading, setLoading] = useState(true)

  const rewardPoints = user?.rewardPoints || 0

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch('/api/account/rewards/history', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          setEntries(data.entries ?? [])
          setPointValue(data.pointValue ?? 0.01)
          setBalance(data.balance ?? 0)
          setBalanceWorth(data.balanceWorth ?? 0)
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [])

  // Use the live balance from the API, fall back to the auth store value
  const displayPoints = balance || rewardPoints
  const displayWorth = balanceWorth || +(displayPoints * pointValue).toFixed(2)

  // Format the trigger type into a readable label
  function triggerLabel(trigger?: string): string {
    switch (trigger) {
      case 'FIRST_RECHARGE': return 'First Recharge Bonus'
      case 'MIN_AMOUNT': return 'High Value Recharge'
      case 'RECHARGE_COUNT': return 'Loyalty Bonus'
      default: return 'Reward'
    }
  }

  // Pick an accent color for the trigger badge
  function triggerColor(trigger?: string): string {
    switch (trigger) {
      case 'FIRST_RECHARGE': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'MIN_AMOUNT': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'RECHARGE_COUNT': return 'bg-purple-100 text-purple-700 border-purple-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rewards</h1>
        <p className="text-muted-foreground">Earn and redeem points on your recharges</p>
      </div>

      {/* Points Balance Card — no progress bar, shows monetary worth */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-4xl font-bold text-primary">{displayPoints.toLocaleString()}</p>
              <p className="text-muted-foreground">Available Points</p>
              <div className="mt-2 flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-600">
                  Worth ${displayWorth.toFixed(2)} USD
                </span>
                <span className="text-xs text-muted-foreground">
                  (1 pt = ${pointValue} USD)
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Earn More Points
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            How Rewards Work
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Earn Points</p>
                <p className="text-sm text-muted-foreground">
                  Get bonus points on qualifying recharges
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Points Have Value</p>
                <p className="text-sm text-muted-foreground">
                  Each point is worth real money (${pointValue} USD)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Redeem</p>
                <p className="text-sm text-muted-foreground">
                  Use points for discounts on future recharges
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Membership Tiers — commented out per requirement */}
      {/*
      <Card>
        <CardHeader>
          <CardTitle>Membership Tiers</CardTitle>
          <CardDescription>Unlock better rewards as you earn more points</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier) => {
              const isCurrentTier = tier.name === currentTier.name
              return (
                <div
                  key={tier.name}
                  className={`rounded-lg border p-4 ${isCurrentTier ? 'border-primary bg-primary/5' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-4 w-4 rounded-full ${tier.color}`} />
                    <p className="font-semibold">{tier.name}</p>
                    {isCurrentTier && (
                      <Badge variant="secondary" className="ml-auto">Current</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {tier.minPoints.toLocaleString()}+ points
                  </p>
                  <p className="text-lg font-bold text-primary">{tier.discount} off</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
      */}

      {/* Points Activity — real data from reward_ledger with transaction details */}
      <Card>
        <CardHeader>
          <CardTitle>Points Activity</CardTitle>
          <CardDescription>Your recent reward points earned from recharges</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="received" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                <TabsTrigger value="received">Received Points</TabsTrigger>
                <TabsTrigger value="consumed">Consumed Points</TabsTrigger>
              </TabsList>

              <TabsContent value="received">
                {entries.filter((e) => e.points > 0).length === 0 ? (
                  <div className="text-center py-8">
                    <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="font-medium">No reward points earned yet</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Start earning points by making your first recharge
                    </p>
                    <Button asChild>
                      <Link href="/">
                        Make a Recharge
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entries
                      .filter((e) => e.points > 0)
                      .map((entry) => {
                        const txn = entry.transactions
                        const trigger = entry.metadata?.trigger
                        const mobileNumber = txn?.metadata?.mobile_number || txn?.description || '—'
                        const amount = txn?.amount
                        const currency = txn?.currency || 'INR'
                        const status = txn?.status
                        const date = new Date(entry.created_at)

                        return (
                          <div
                            key={entry.id}
                            className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              {/* Left: details */}
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shrink-0">
                                  <Sparkles className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-sm">{triggerLabel(trigger)}</p>
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-1.5 py-0 h-5 ${triggerColor(trigger)}`}
                                    >
                                      {trigger || 'REWARD'}
                                    </Badge>
                                  </div>

                                  {/* Recharge details */}
                                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Phone className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{mobileNumber}</span>
                                  </div>

                                  {amount != null && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      Recharge: {amount.toFixed(2)} {currency}
                                      {status && (
                                        <span
                                          className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${status === 'completed'
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : status === 'failed'
                                                ? 'bg-red-50 text-red-700'
                                                : 'bg-amber-50 text-amber-700'
                                            }`}
                                        >
                                          {status}
                                        </span>
                                      )}
                                    </p>
                                  )}

                                  <p className="text-[11px] text-muted-foreground mt-1">
                                    {date.toLocaleDateString(undefined, {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}{' '}
                                    at{' '}
                                    {date.toLocaleTimeString(undefined, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                              </div>

                              {/* Right: points earned */}
                              <div className="text-right shrink-0">
                                <p className="text-lg font-bold text-emerald-600">
                                  +{entry.points}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  pts (${(entry.points * pointValue).toFixed(2)})
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="consumed">
                {entries.filter((e) => e.points < 0).length === 0 ? (
                  <div className="text-center py-8">
                    <Coins className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="font-medium">No points consumed yet</p>
                    <p className="text-sm text-muted-foreground">
                      Points you redeem during mobile recharges will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entries
                      .filter((e) => e.points < 0)
                      .map((entry) => {
                        const txn = entry.transactions
                        const trigger = entry.metadata?.trigger
                        const mobileNumber = txn?.metadata?.mobile_number || txn?.description || '—'
                        const amount = txn?.amount
                        const currency = txn?.currency || 'INR'
                        const status = txn?.status
                        const date = new Date(entry.created_at)

                        return (
                          <div
                            key={entry.id}
                            className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              {/* Left: details */}
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 shrink-0">
                                  <Coins className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-sm">Redeemed Discount</p>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 h-5 bg-red-100 text-red-700 border-red-200"
                                    >
                                      CONSUMED
                                    </Badge>
                                  </div>

                                  {/* Recharge details */}
                                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Phone className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{mobileNumber}</span>
                                  </div>

                                  {amount != null && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      Recharge: {amount.toFixed(2)} {currency}
                                      {status && (
                                        <span
                                          className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${status === 'completed'
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : status === 'failed'
                                                ? 'bg-red-50 text-red-700'
                                                : 'bg-amber-50 text-amber-700'
                                            }`}
                                        >
                                          {status}
                                        </span>
                                      )}
                                    </p>
                                  )}

                                  <p className="text-[11px] text-muted-foreground mt-1">
                                    {date.toLocaleDateString(undefined, {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}{' '}
                                    at{' '}
                                    {date.toLocaleTimeString(undefined, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                              </div>

                              {/* Right: points consumed */}
                              <div className="text-right shrink-0">
                                <p className="text-lg font-bold text-red-600">
                                  {entry.points}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  pts (-${(Math.abs(entry.points) * pointValue).toFixed(2)})
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Important Notice */}
      <Card className="border-amber-200 bg-amber-50  ">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 ">
                Points Expiry Notice
              </p>
              <p className="text-sm text-amber-700 ">
                Reward points are valid for 1 year from the date of earning. Points cannot be
                converted to cash, transferred, or withdrawn.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
