'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Phone,
  Search,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useRechargeStore, useAuthStore, useLocalePreferencesStore } from '@/lib/stores'
import type { Carrier, Product } from '@/lib/types'

// Steps for the recharge flow
const steps = [
  { id: 1, name: 'Phone Number', description: 'Enter recipient details' },
  { id: 2, name: 'Select Plan', description: 'Choose a top-up amount' },
  { id: 3, name: 'Review & Pay', description: 'Confirm and complete' },
]

export default function RechargePage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { currencyCode } = useLocalePreferencesStore()
  const {
    selectedCountry,
    selectedCarrier,
    selectedProduct,
    phoneNumber,
    countries,
    setCountry,
    setCarrier,
    setProduct,
    setPhoneNumber,
    setCountries,
    isLoadingCarriers,
    isLoadingProducts,
    isProcessing,
    processRecharge,
    currentOrder,
  } = useRechargeStore()

  const [step, setStep] = useState(1)
  const [carrierOpen, setCarrierOpen] = useState(false)
  const [localPhone, setLocalPhone] = useState(phoneNumber || '')
  const [isDetecting, setIsDetecting] = useState(false)
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productFilter, setProductFilter] = useState<'all' | 'data' | 'voice' | 'combo'>('all')

  useEffect(() => {
    void fetch('/api/countries', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setCountries(Array.isArray(data?.countries) ? data.countries : []))
      .catch(() => setCountries([]))
  }, [setCountries])

  const formatCurrency = (amount: number, currency = currencyCode) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(amount)

  // Ensure a default country exists (navbar Top-up should work)
  useEffect(() => {
    if (selectedCountry) return
    const fallback = countries.find((c) => c.code === 'IN') ?? countries[0] ?? null
    if (fallback) setCountry(fallback)
  }, [selectedCountry, countries, setCountry])

  // Load carriers when country is selected
  useEffect(() => {
    if (selectedCountry) {
      void fetch(`/api/providers?countryCode=${encodeURIComponent(selectedCountry.code)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => setCarriers(Array.isArray(data?.providers) ? data.providers : []))
        .catch(() => setCarriers([]))
    }
  }, [selectedCountry])

  // Load products when carrier is selected
  useEffect(() => {
    if (selectedCarrier) {
      const params = new URLSearchParams({
        country: selectedCountry?.code ?? '',
        providerCode: selectedCarrier.code,
      })
      void fetch(`/api/plans?${params}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          const rows = Array.isArray(data?.plans) ? data.plans : []
          setProducts(
            rows.map((p: any): Product => ({
              id: String(p.id),
              skuCode: String(p.id),
              carrierCode: selectedCarrier.code,
              name: String(p.planName || p.benefits || p.id),
              displayText: String(p.benefits || p.planName || p.id),
              type: p.type === 'data' ? 'data' : p.type === 'unlimited' ? 'voice' : 'combo',
              minSendAmount: Number(p.price_eur ?? p.price_inr ?? 0),
              maxSendAmount: Number(p.price_eur ?? p.price_inr ?? 0),
              sendCurrency: p.price_eur != null ? 'EUR' : 'INR',
              minReceiveAmount: Number(p.price_inr ?? p.price_eur ?? 0),
              maxReceiveAmount: Number(p.price_inr ?? p.price_eur ?? 0),
              receiveCurrency: 'INR',
              commissionRate: 0,
              processingMode: 'Instant',
              benefits: p.benefits ? [{ type: 'benefit', info: String(p.benefits) }] : [],
              validity: p.validity || undefined,
              isPromo: p.tag === 'popular',
            })),
          )
        })
        .catch(() => setProducts([]))
    } else {
      setProducts([])
    }
  }, [selectedCarrier, selectedCountry])

  // Auto-detect carrier when phone number is complete
  useEffect(() => {
    const detectCarrier = async () => {
      if (localPhone.length >= 10 && selectedCountry && !selectedCarrier) {
        setIsDetecting(true)
        try {
          const res = await fetch('/api/operator/detect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: localPhone, countryCode: selectedCountry.code }),
          })
          const data = await res.json().catch(() => ({}))
          const match = carriers.find((c) => c.code === data.providerCode || c.name === data.operator || c.shortName === data.operator)
          if (match) setCarrier(match)
        } finally {
          setIsDetecting(false)
        }
      }
    }
    detectCarrier()
  }, [localPhone, selectedCountry, selectedCarrier, carriers, setCarrier])

  const handleContinueToPlans = () => {
    if (localPhone && selectedCarrier) {
      setPhoneNumber(localPhone)
      setStep(2)
    }
  }

  const handleSelectProduct = (product: Product) => {
    setProduct(product)
    setStep(3)
  }

  const handleConfirmRecharge = async () => {
    const order = await processRecharge()
    if (order) {
      router.push(`/recharge/success?orderId=${order.id}`)
    }
  }

  const filteredProducts = products.filter(p => 
    productFilter === 'all' || p.type === productFilter
  )

  if (!selectedCountry) return null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center py-8 text-center md:max-w-4xl">
      {/* Progress Steps */}
      <nav aria-label="Progress" className="mb-8 w-full">
        <ol className="flex items-center justify-center">
          {steps.map((s, idx) => (
            <li key={s.id} className={cn('flex items-center', idx !== steps.length - 1 && 'flex-1')}>
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-medium',
                    step > s.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : step === s.id
                        ? 'border-primary text-primary'
                        : 'border-muted text-muted-foreground'
                  )}
                >
                  {step > s.id ? <Check className="h-5 w-5" /> : s.id}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium hidden sm:block',
                    step >= s.id ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {s.name}
                </span>
              </div>
              {idx !== steps.length - 1 && (
                <div
                  className={cn(
                    'mx-4 h-0.5 w-full min-w-[60px] flex-1',
                    step > s.id ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Step 1: Phone Number & Carrier */}
      {step === 1 && (
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <span className="text-2xl">{selectedCountry.flag}</span>
              Send to {selectedCountry.name}
            </CardTitle>
            <CardDescription>
              Enter the phone number you want to recharge
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-left">
            {/* Phone Number Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone Number</label>
              <div className="flex gap-2">
                <div className="flex h-12 items-center px-4 border rounded-md bg-muted text-sm font-medium">
                  {selectedCountry.dialCode}
                </div>
                <div className="relative flex-1">
                  <Input
                    type="tel"
                    placeholder="Enter phone number"
                    value={localPhone}
                    onChange={(e) => {
                      setLocalPhone(e.target.value.replace(/\D/g, ''))
                      if (selectedCarrier) {
                        setCarrier(null)
                      }
                    }}
                    className="h-12 pr-10"
                  />
                  {isDetecting && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>

            {/* Carrier Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Mobile Operator</label>
                {isDetecting && (
                  <span className="text-xs text-muted-foreground">Detecting...</span>
                )}
              </div>
              <Popover open={carrierOpen} onOpenChange={setCarrierOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={carrierOpen}
                    className="w-full justify-between h-12"
                  >
                    {selectedCarrier ? (
                      <span className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-primary" />
                        <span>{selectedCarrier.name}</span>
                        <Badge variant="secondary" className="ml-2">Auto-detected</Badge>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select operator...</span>
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search operator..." />
                    <CommandList>
                      <CommandEmpty>No operator found.</CommandEmpty>
                      <CommandGroup>
                        {carriers.map((carrier) => (
                          <CommandItem
                            key={carrier.id}
                            value={carrier.name}
                            onSelect={() => {
                              setCarrier(carrier)
                              setCarrierOpen(false)
                            }}
                          >
                            <Smartphone className="mr-2 h-4 w-4" />
                            <span>{carrier.name}</span>
                            <Check
                              className={cn(
                                'ml-auto h-4 w-4',
                                selectedCarrier?.id === carrier.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                We auto-detect the operator. Select manually if incorrect.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => router.push('/')} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleContinueToPlans}
                disabled={!localPhone || !selectedCarrier}
                className="flex-1"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select Plan */}
      {step === 2 && (
        <div className="w-full space-y-6">
          <Card className="w-full">
            <CardContent className="pt-6 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedCountry.flag}</span>
                  <div>
                    <p className="font-medium">{selectedCountry.dialCode} {phoneNumber}</p>
                    <p className="text-sm text-muted-foreground">{selectedCarrier?.name}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Plan Filters */}
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant={productFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setProductFilter('all')}
            >
              All Plans
            </Button>
            <Button
              variant={productFilter === 'data' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setProductFilter('data')}
            >
              <Wifi className="mr-1 h-4 w-4" />
              Data
            </Button>
            <Button
              variant={productFilter === 'voice' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setProductFilter('voice')}
            >
              <Phone className="mr-1 h-4 w-4" />
              Voice
            </Button>
            <Button
              variant={productFilter === 'combo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setProductFilter('combo')}
            >
              <Zap className="mr-1 h-4 w-4" />
              Combo
            </Button>
          </div>

          {/* Products Grid */}
          <div className="grid w-full gap-4 text-left sm:grid-cols-2">
            {isLoadingProducts ? (
              <>
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </>
            ) : filteredProducts.length === 0 ? (
              <Card className="col-span-2 p-8 text-center">
                <p className="text-muted-foreground">No plans available for this filter.</p>
              </Card>
            ) : (
              filteredProducts.map((product) => (
                <Card
                  key={product.id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
                    selectedProduct?.id === product.id && 'border-primary ring-2 ring-primary/20'
                  )}
                  onClick={() => handleSelectProduct(product)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{product.name}</h3>
                        <p className="text-sm text-muted-foreground">{product.displayText}</p>
                      </div>
                      {product.isPromo && (
                        <Badge className="bg-accent text-accent-foreground">
                          <Sparkles className="mr-1 h-3 w-3" />
                          Promo
                        </Badge>
                      )}
                    </div>
                    
                    {/* Benefits */}
                    <div className="space-y-1 mb-4">
                      {product.benefits.map((benefit, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary" />
                          <span>
                            {benefit.type}: {benefit.value ? `${benefit.value} ${benefit.unit || ''}` : benefit.info}
                          </span>
                        </div>
                      ))}
                      {product.validity && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Validity: {product.validity}</span>
                        </div>
                      )}
                    </div>

                    {/* Price */}
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold text-primary">{formatCurrency(product.minSendAmount, product.sendCurrency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.minReceiveAmount} {product.receiveCurrency}
                        </p>
                      </div>
                      <Button size="sm">Select</Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <Button variant="outline" onClick={() => setStep(1)} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Phone Number
          </Button>
        </div>
      )}

      {/* Step 3: Review & Pay */}
      {step === 3 && selectedProduct && (
        <div className="w-full space-y-6">
          <Card className="w-full">
            <CardHeader className="text-center">
              <CardTitle>Review Your Order</CardTitle>
              <CardDescription>Please verify the details before payment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-left">
              {/* Recipient Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Recipient</h4>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <span className="text-2xl">{selectedCountry.flag}</span>
                  <div>
                    <p className="font-medium">{selectedCountry.dialCode} {phoneNumber}</p>
                    <p className="text-sm text-muted-foreground">{selectedCarrier?.name}</p>
                  </div>
                </div>
              </div>

              {/* Plan Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Selected Plan</h4>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">{selectedProduct.name}</p>
                      <p className="text-sm text-muted-foreground">{selectedProduct.displayText}</p>
                    </div>
                    {selectedProduct.isPromo && (
                      <Badge className="bg-accent text-accent-foreground">
                        <Sparkles className="mr-1 h-3 w-3" />
                        Promo
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    {selectedProduct.benefits.map((benefit, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary" />
                        <span>
                          {benefit.type}: {benefit.value ? `${benefit.value} ${benefit.unit || ''}` : benefit.info}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Price Breakdown */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Top-up Amount</span>
                  <span>{formatCurrency(selectedProduct.minSendAmount, selectedProduct.sendCurrency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Service Fee</span>
                  <span>{formatCurrency(0, selectedProduct.sendCurrency)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span className="text-primary">
                    {formatCurrency(selectedProduct.minSendAmount, selectedProduct.sendCurrency)}
                  </span>
                </div>
              </div>

              {/* Reward Points */}
              {isAuthenticated && (
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span>
                      You&apos;ll earn <strong>{Math.floor(selectedProduct.minSendAmount)} reward points</strong> with this purchase!
                    </span>
                  </div>
                </div>
              )}

              {!isAuthenticated && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Create an account</strong> after checkout to earn reward points and access your transaction history!
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleConfirmRecharge}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Pay {formatCurrency(selectedProduct.minSendAmount, selectedProduct.sendCurrency)}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
