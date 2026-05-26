'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuthStore, useWalletStore } from '@/lib/stores'
import { Gift, Sparkles, Trophy, Clock, ArrowRight, Info } from 'lucide-react'
import Link from 'next/link'

export default function RewardsPage() {
  const { user } = useAuthStore()
  const { transactions } = useWalletStore()

  const rewardPoints = user?.rewardPoints || 0
  const pointsToNextTier = 500 - (rewardPoints % 500)
  const progress = ((rewardPoints % 500) / 500) * 100

  // Filter points transactions
  const pointsHistory = transactions.filter(
    (t) => t.type === 'points_earned' || t.type === 'points_redeemed'
  )

  // Reward tiers
  const tiers = [
    { name: 'Bronze', minPoints: 0, discount: '0%', color: 'bg-amber-700' },
    { name: 'Silver', minPoints: 500, discount: '2%', color: 'bg-gray-400' },
    { name: 'Gold', minPoints: 1000, discount: '5%', color: 'bg-yellow-500' },
    { name: 'Platinum', minPoints: 2500, discount: '10%', color: 'bg-purple-500' },
  ]

  const currentTier = [...tiers].reverse().find((t) => rewardPoints >= t.minPoints) || tiers[0]
  const nextTier = tiers.find((t) => t.minPoints > rewardPoints)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rewards</h1>
        <p className="text-muted-foreground">Earn and redeem points on your recharges</p>
      </div>

      {/* Points Balance Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`h-6 w-6 rounded-full ${currentTier.color}`} />
                <Badge variant="secondary">{currentTier.name} Member</Badge>
              </div>
              <p className="text-4xl font-bold text-primary">{rewardPoints.toLocaleString()}</p>
              <p className="text-muted-foreground">Available Points</p>
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

          {nextTier && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Progress to {nextTier.name}</span>
                <span className="text-muted-foreground">
                  {pointsToNextTier} points to go
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
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
                  Get 1 point for every $1 spent on recharges
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Level Up</p>
                <p className="text-sm text-muted-foreground">
                  Reach higher tiers for better discounts
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
                  Use 100+ points to get discounts on recharges
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Membership Tiers */}
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
                  className={`rounded-lg border p-4 ${
                    isCurrentTier ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-4 w-4 rounded-full ${tier.color}`} />
                    <p className="font-semibold">{tier.name}</p>
                    {isCurrentTier && (
                      <Badge variant="secondary" className="ml-auto">
                        Current
                      </Badge>
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

      {/* Points History */}
      <Card>
        <CardHeader>
          <CardTitle>Points Activity</CardTitle>
          <CardDescription>Your recent points earned and redeemed</CardDescription>
        </CardHeader>
        <CardContent>
          {pointsHistory.length === 0 ? (
            <div className="text-center py-8">
              <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">No points activity yet</p>
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
            <div className="space-y-4">
              {pointsHistory.slice(0, 5).map((txn) => (
                <div key={txn.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{txn.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(txn.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`font-semibold ${
                      txn.type === 'points_earned' ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {txn.type === 'points_earned' ? '+' : '-'}
                    {txn.amount} pts
                  </p>
                </div>
              ))}
            </div>
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
