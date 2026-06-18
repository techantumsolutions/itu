'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle2,
  Copy,
  Download,
  Gift,
  Home,
  RotateCcw,
  Share2,
  Sparkles,
} from 'lucide-react'
import { useRechargeStore, useAuthStore } from '@/lib/stores'
import { cn } from '@/lib/utils'
import { ConfettiCelebration } from '@/components/confetti-celebration'

function RechargeSuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const { currentOrder, resetRecharge } = useRechargeStore()
  const { isAuthenticated, user } = useAuthStore()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!currentOrder && !orderId) {
      router.push('/')
    }
  }, [currentOrder, orderId, router])

  const handleCopyOrderId = () => {
    if (currentOrder?.id) {
      navigator.clipboard.writeText(currentOrder.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleNewRecharge = () => {
    resetRecharge()
    router.push('/')
  }

  if (!currentOrder) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      {isAuthenticated && currentOrder.rewardPointsEarned && currentOrder.rewardPointsEarned > 0 && (
        <ConfettiCelebration />
      )}
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent/20">
          <CheckCircle2 className="h-12 w-12 text-accent" />
        </div>
        <h1 className="text-3xl font-bold text-accent">Recharge Successful!</h1>
        <p className="mt-2 text-muted-foreground">
          Your top-up has been sent successfully
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Transaction Details</CardTitle>
            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30">
              Completed
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Order ID */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Order ID</p>
              <p className="font-mono text-sm">{currentOrder.id}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleCopyOrderId}>
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-accent" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Recipient */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Recipient</p>
            <p className="font-medium">+{currentOrder.countryCode} {currentOrder.phoneNumber}</p>
            <p className="text-sm text-muted-foreground">{currentOrder.carrierName}</p>
          </div>

          {/* Plan */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="font-medium">{currentOrder.productName}</p>
            <p className="text-sm text-muted-foreground">
              {currentOrder.receiveAmount} {currentOrder.receiveCurrency}
            </p>
          </div>

          <Separator />

          {/* Amount */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="text-xl font-bold text-primary">
              ${currentOrder.totalAmount.toFixed(2)} {currentOrder.sendCurrency}
            </span>
          </div>

          {/* Reward Points */}
          {isAuthenticated && currentOrder.rewardPointsEarned && currentOrder.rewardPointsEarned > 0 && (
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-5 w-5" />
                <span className="font-medium">
                  +{currentOrder.rewardPointsEarned} points earned!
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total balance: {(user?.rewardPoints || 0) + currentOrder.rewardPointsEarned} points
              </p>
            </div>
          )}

          {/* Create Account CTA for non-authenticated users */}
          {!isAuthenticated && (
            <div className="p-4 bg-muted rounded-lg border">
              <div className="flex items-start gap-3">
                <Gift className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Create an Account</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Get reward points on every recharge, save your contacts, and access your transaction history.
                  </p>
                  <Button size="sm" className="mt-3" asChild>
                    <Link href={`/register?redirect=/account/transactions`}>
                      Create Account
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="mt-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Receipt
          </Button>
          <Button variant="outline" className="w-full">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        </div>
        <Button onClick={handleNewRecharge} className="w-full">
          <RotateCcw className="mr-2 h-4 w-4" />
          Send Another Top-Up
        </Button>
        <Button variant="ghost" asChild className="w-full">
          <Link href="/">
            <Home className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
        </Button>
      </div>

      {/* Email Confirmation Note */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        A confirmation email has been sent to your registered email address.
      </p>
    </div>
  )
}

export default function RechargeSuccessPage() {
  return (
    <Suspense fallback={
      <div className="container max-w-lg py-12 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <RechargeSuccessContent />
    </Suspense>
  )
}
