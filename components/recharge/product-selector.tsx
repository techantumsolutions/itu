"use client"

import { ArrowLeft, Smartphone, Zap, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useRechargeStore } from "@/lib/stores"
import { cn } from "@/lib/utils"

export function ProductSelector() {
  const {
    products,
    selectedCountry,
    selectedCarrier,
    selectedProduct,
    setProduct,
    setStep,
  } = useRechargeStore()

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  const handleSelect = (product: typeof products[0]) => {
    setProduct(product)
    setStep(4)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setStep(2)}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Select Amount</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a top-up amount for {selectedCarrier?.name}
          </p>
        </div>
      </div>

      {/* Selected carrier indicator */}
      <Card className="bg-muted/50 border-0">
        <CardContent className="flex items-center gap-3 p-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">{selectedCountry?.flag}</span>
            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div>
            <p className="font-medium">{selectedCarrier?.name}</p>
            <p className="text-xs text-muted-foreground">{selectedCountry?.name}</p>
          </div>
        </CardContent>
      </Card>

      <ScrollArea className="h-[350px] pr-4">
        <div className="grid gap-3">
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground">No products available</p>
              <p className="text-sm text-muted-foreground">
                Please try another carrier
              </p>
            </div>
          ) : (
            products.map((product) => (
              <Card
                key={product.id}
                className={cn(
                  "cursor-pointer transition-all hover:bg-accent/50 border shadow-sm",
                  selectedProduct?.id === product.id && "bg-primary/10 ring-2 ring-primary"
                )}
                onClick={() => handleSelect(product)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold">
                          {formatCurrency(product.minReceiveAmount, product.receiveCurrency)}
                        </p>
                        {product.isPromo && (
                          <Badge variant="secondary" className="bg-success/10 text-success">
                            <Zap className="h-3 w-3 mr-1" />
                            Promo
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {product.name}
                      </p>
                      {product.displayText && (
                        <p className="text-xs text-muted-foreground">
                          {product.displayText}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">
                        {formatCurrency(product.minSendAmount, product.sendCurrency)}
                      </p>
                      <p className="text-xs text-muted-foreground">You pay</p>
                    </div>
                  </div>
                  {product.validity && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Valid for {product.validity}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
