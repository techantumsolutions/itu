"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, Loader2, Wallet, Smartphone, Globe } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useRechargeStore, useWalletStore } from "@/lib/stores"

export function Confirmation() {
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  
  const {
    selectedCountry,
    selectedCarrier,
    selectedProduct,
    phoneNumber,
    setStep,
    resetRecharge,
    processRecharge,
  } = useRechargeStore()

  const { balance, deduct } = useWalletStore()

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  const handleConfirm = async () => {
    if (!selectedProduct) return
    
    setIsProcessing(true)
    
    const order = await processRecharge()
    const success = !!order
    
    if (success) {
      setIsSuccess(true)
    }
    
    setIsProcessing(false)
  }

  const handleDone = () => {
    resetRecharge()
    router.push("/dashboard")
  }

  const handleNewRecharge = () => {
    resetRecharge()
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
        <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Recharge Successful!</h2>
          <p className="text-muted-foreground mt-2">
            {formatCurrency(
              selectedProduct?.minReceiveAmount || 0,
              selectedProduct?.receiveCurrency || "USD"
            )}{" "}
            has been sent to
          </p>
          <p className="font-mono text-lg mt-1">
            {selectedCountry?.dialCode} {phoneNumber}
          </p>
        </div>
        
        <Card className="w-full max-w-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Transaction ID</span>
              <span className="font-mono">TXN-{Date.now().toString(36).toUpperCase()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount Paid</span>
              <span className="font-medium">
                {formatCurrency(
                  selectedProduct?.minSendAmount || 0,
                  selectedProduct?.sendCurrency || "USD"
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Carrier</span>
              <span>{selectedCarrier?.name}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 w-full max-w-sm">
          <Button variant="outline" className="flex-1" onClick={handleNewRecharge}>
            New Recharge
          </Button>
          <Button className="flex-1" onClick={handleDone}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setStep(4)}
          className="shrink-0"
          disabled={isProcessing}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Confirm Recharge</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review your order before confirming
          </p>
        </div>
      </div>

      {/* Order details */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Recipient */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Recipient</p>
              <p className="font-mono font-medium">
                {selectedCountry?.dialCode} {phoneNumber}
              </p>
            </div>
          </div>

          <Separator />

          {/* Country & Carrier */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Country & Carrier</p>
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedCountry?.flag}</span>
                <span className="font-medium">{selectedCarrier?.name}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Product */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Product</p>
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{selectedProduct?.name}</p>
                {selectedProduct?.validity && (
                  <p className="text-xs text-muted-foreground">
                    Valid for {selectedProduct.validity}
                  </p>
                )}
              </div>
              <p className="text-lg font-bold">
                {formatCurrency(
                  selectedProduct?.minReceiveAmount || 0,
                  selectedProduct?.receiveCurrency || "USD"
                )}
              </p>
            </div>
          </div>

          <Separator />

          {/* Payment summary */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>
                {formatCurrency(
                  selectedProduct?.minSendAmount || 0,
                  selectedProduct?.sendCurrency || "USD"
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Service Fee</span>
              <span className="text-success">Free</span>
            </div>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="text-xl font-bold text-primary">
                {formatCurrency(
                  selectedProduct?.minSendAmount || 0,
                  selectedProduct?.sendCurrency || "USD"
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wallet balance */}
      <Card className="bg-muted/50 border-0">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
              <p className="font-medium">{formatCurrency(balance, "USD")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/wallet")}>
            Top Up
          </Button>
        </CardContent>
      </Card>

      {/* Confirm button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleConfirm}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            Confirm & Pay{" "}
            {formatCurrency(
              selectedProduct?.minSendAmount || 0,
              selectedProduct?.sendCurrency || "USD"
            )}
          </>
        )}
      </Button>
    </div>
  )
}
