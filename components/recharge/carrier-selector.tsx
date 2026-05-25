"use client"

import { useState } from "react"
import { Search, ChevronRight, ArrowLeft } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRechargeStore } from "@/lib/stores"
import { cn } from "@/lib/utils"

export function CarrierSelector() {
  const [search, setSearch] = useState("")
  const { 
    carriers, 
    selectedCountry, 
    selectedCarrier, 
    setCarrier, 
    loadProducts, 
    setStep 
  } = useRechargeStore()

  const filteredCarriers = carriers.filter((carrier) =>
    carrier.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (carrier: typeof carriers[0]) => {
    setCarrier(carrier)
    loadProducts(carrier.id)
    setStep(3)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setStep(1)}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Select Carrier</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a mobile carrier in {selectedCountry?.name}
          </p>
        </div>
      </div>

      {/* Selected country indicator */}
      <Card className="bg-muted/50 border-0">
        <CardContent className="flex items-center gap-3 p-3">
          <span className="text-2xl">{selectedCountry?.flag}</span>
          <div>
            <p className="font-medium">{selectedCountry?.name}</p>
            <p className="text-xs text-muted-foreground">{selectedCountry?.dialCode}</p>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search carriers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-[350px] pr-4">
        <div className="space-y-2">
          {filteredCarriers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground">No carriers found</p>
              <p className="text-sm text-muted-foreground">
                Try a different search term
              </p>
            </div>
          ) : (
            filteredCarriers.map((carrier) => (
              <Card
                key={carrier.id}
                className={cn(
                  "cursor-pointer transition-all hover:bg-accent/50 border-0 shadow-sm",
                  selectedCarrier?.id === carrier.id && "bg-primary/10 ring-2 ring-primary"
                )}
                onClick={() => handleSelect(carrier)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                      <span className="text-lg font-bold text-muted-foreground">
                        {carrier.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{carrier.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {carrier.shortName || carrier.code} plans available
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
