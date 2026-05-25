"use client"

import { useState } from "react"
import { ArrowLeft, Phone, CheckCircle, AlertCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRechargeStore, useWalletStore } from "@/lib/stores"
import { cn } from "@/lib/utils"

export function PhoneInput() {
  const {
    selectedCountry,
    selectedCarrier,
    selectedProduct,
    phoneNumber,
    setPhoneNumber,
    setStep,
  } = useRechargeStore()

  const { balance } = useWalletStore()
  const [isValid, setIsValid] = useState<boolean | null>(null)

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  const validatePhone = (phone: string) => {
    // Simple validation - at least 7 digits
    const digitsOnly = phone.replace(/\D/g, "")
    return digitsOnly.length >= 7
  }

  const handlePhoneChange = (value: string) => {
    setPhoneNumber(value)
    if (value.length > 0) {
      setIsValid(validatePhone(value))
    } else {
      setIsValid(null)
    }
  }

  const handleContinue = () => {
    if (isValid) {
      setStep(5)
    }
  }

  const hasEnoughBalance = selectedProduct 
    ? balance >= selectedProduct.minSendAmount 
    : true

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setStep(3)}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Enter Phone Number</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the recipient&apos;s mobile number
          </p>
        </div>
      </div>

      {/* Order summary */}
      <Card className="bg-muted/50 border-0">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">{selectedCountry?.flag}</span>
              <div>
                <p className="font-medium">{selectedCarrier?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedCountry?.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">
                {formatCurrency(
                  selectedProduct?.minSendAmount || 0,
                  selectedProduct?.sendCurrency || "USD"
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(
                  selectedProduct?.minReceiveAmount || 0,
                  selectedProduct?.receiveCurrency || "USD"
                )}{" "}
                credit
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phone number input */}
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground">
            <span className="text-lg">{selectedCountry?.flag}</span>
            <span className="text-sm font-medium">{selectedCountry?.dialCode}</span>
          </div>
          <Input
            id="phone"
            type="tel"
            placeholder="Enter phone number"
            value={phoneNumber}
            onChange={(e) => handlePhoneChange(e.target.value)}
            className={cn(
              "pl-24 pr-10 h-12 text-lg",
              isValid === true && "border-success focus-visible:ring-success",
              isValid === false && "border-destructive focus-visible:ring-destructive"
            )}
          />
          {isValid !== null && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isValid ? (
                <CheckCircle className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
          )}
        </div>
        {isValid === false && (
          <p className="text-xs text-destructive">
            Please enter a valid phone number
          </p>
        )}
      </div>

      {/* Wallet balance warning */}
      {!hasEnoughBalance && (
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="flex items-center gap-3 p-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Insufficient balance</p>
              <p className="text-xs text-muted-foreground">
                Your wallet balance is {formatCurrency(balance, "USD")}. Please top up your wallet.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue button */}
      <Button
        className="w-full"
        size="lg"
        disabled={!isValid || !hasEnoughBalance}
        onClick={handleContinue}
      >
        <Phone className="h-4 w-4 mr-2" />
        Continue to Confirmation
      </Button>
    </div>
  )
}
