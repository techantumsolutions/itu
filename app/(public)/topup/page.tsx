'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CalendarDays, ChevronDown, MessageSquareText, PhoneCall, Sparkles, Wifi } from 'lucide-react'
import { useTopupStore, type TopupPlan } from '@/store/topupStore'

type OperatorDetectResponse = { operator: string; country: string; providerCode?: string; source?: string }
type DbProvider = { code: string; name: string; shortName: string }
type DbPlan = TopupPlan

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'topup', label: 'Top-Up' },
  { id: 'unlimited', label: 'Unlimited Pack' },
  { id: 'data', label: 'Data Pack' },
] as const

export default function TopupPlanSelectionPage() {
  const router = useRouter()
  const { countryCode, phoneNumber, operator, setPhoneDetails, setOperator, selectPlan, calculatePricing } =
    useTopupStore()

  const [localPhone, setLocalPhone] = useState(phoneNumber)
  const [detecting, setDetecting] = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [plans, setPlans] = useState<TopupPlan[]>([])
  const [resolvedProviderCode, setResolvedProviderCode] = useState<string | undefined>()
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('all')
  const [sort, setSort] = useState<'popular' | 'price' | 'validity'>('popular')

  const [operatorDialogOpen, setOperatorDialogOpen] = useState(false)
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providers, setProviders] = useState<DbProvider[]>([])
  const [selectedProviderCode, setSelectedProviderCode] = useState<string>('')
  const [manualOperatorOverride, setManualOperatorOverride] = useState<boolean>(false)

  const effectiveOperatorId = resolvedProviderCode || selectedProviderCode
  const operatorReady = Boolean(effectiveOperatorId) || (Boolean(operator) && operator.toLowerCase() !== 'unknown')
  const showPlansSection = localPhone.trim().length >= 10
  const showPlans = showPlansSection && operatorReady

  useEffect(() => {
    setPhoneDetails({ countryCode, phoneNumber: localPhone })
  }, [countryCode, localPhone, setPhoneDetails])

  useEffect(() => {
    // If the number changes, let auto-detect run again.
    setManualOperatorOverride(false)
    setSelectedProviderCode('')
    setResolvedProviderCode(undefined)
    setOperator('')
  }, [localPhone, setOperator])

  useEffect(() => {
    const run = async () => {
      if (!localPhone || localPhone.length < 10) {
        setResolvedProviderCode(undefined)
        setOperator('')
        return
      }
      if (manualOperatorOverride) return
      setDetecting(true)
      try {
        const res = await fetch('/api/operator/detect', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: localPhone, countryCode }),
        })
        const data = (await res.json().catch(() => ({}))) as Partial<OperatorDetectResponse>
        const name =
          res.ok && typeof data.operator === 'string' && data.operator.trim().length > 0
            ? data.operator.trim()
            : 'Unknown'
        setOperator(name)
        const pc =
          res.ok && typeof data.providerCode === 'string' ? data.providerCode.trim() : ''
        setResolvedProviderCode(pc || undefined)
      } catch {
        setOperator('Unknown')
        setResolvedProviderCode(undefined)
      } finally {
        setDetecting(false)
      }
    }
    void run()
  }, [localPhone, countryCode, setOperator, manualOperatorOverride])

  useEffect(() => {
    if (detecting || manualOperatorOverride) return
    if (localPhone.length >= 10 && operator.toLowerCase() === 'unknown') {
      setOperatorDialogOpen(true)
    }
  }, [detecting, operator, localPhone, manualOperatorOverride])

  useEffect(() => {
    if (!operatorDialogOpen) return
    const loadProviders = async () => {
      setProvidersLoading(true)
      try {
        const res = await fetch(`/api/providers?countryCode=${encodeURIComponent(countryCode)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => ({}))) as { providers?: DbProvider[] }
        const mapped = Array.isArray(json.providers) ? json.providers : []
        setProviders(mapped)
        if (!selectedProviderCode && mapped.length) {
          const initial =
            resolvedProviderCode && mapped.some((m) => m.code === resolvedProviderCode)
              ? resolvedProviderCode
              : mapped[0]!.code
          setSelectedProviderCode(initial)
        }
      } finally {
        setProvidersLoading(false)
      }
    }
    void loadProviders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorDialogOpen, countryCode])

  useEffect(() => {
    const load = async () => {
      if (!showPlans) return
      setLoadingPlans(true)
      try {
        const params = new URLSearchParams({
          countryId: countryCode,
          limit: '200',
        })
        if (effectiveOperatorId) params.set('operatorId', effectiveOperatorId)
        else if (operator && operator.toLowerCase() !== 'unknown') params.set('operatorName', operator)
        if (tab !== 'all') params.set('category', tab)

        const res = await fetch(`/api/plans?${params}`, { credentials: 'include', cache: 'no-store' })
        const json = (await res.json().catch(() => ({}))) as { plans?: DbPlan[]; error?: string }
        const raw = Array.isArray(json.plans) ? json.plans : []
        // Filter out plans with invalid data (negative validity, zero price, etc.)
        const valid = raw.filter((p) => {
          const vNum = parseInt(p.validity, 10)
          if (Number.isFinite(vNum) && vNum <= 0) return false
          if (p.price_inr <= 0 && p.price_eur <= 0) return false
          return true
        })
        setPlans(valid)
      } finally {
        setLoadingPlans(false)
      }
    }
    void load()
  }, [showPlans, operator, countryCode, effectiveOperatorId, tab])

  const visiblePlans = useMemo(() => {
    let rows = [...plans]
    if (tab !== 'all') rows = rows.filter((p) => p.type === tab)
    if (sort === 'popular') rows = rows.sort((a, b) => (b.tag === 'popular' ? 1 : 0) - (a.tag === 'popular' ? 1 : 0))
    if (sort === 'price') rows = rows.sort((a, b) => a.price_eur - b.price_eur)
    if (sort === 'validity') rows = rows.sort((a, b) => a.validity.localeCompare(b.validity))
    return rows
  }, [plans, tab, sort])

  const onBuy = (plan: TopupPlan) => {
    selectPlan(plan)
    calculatePricing({ currency: 'EUR', fee: 0.49 })
    router.push('/topup/summary')
  }

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[#f3f9ff]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl">Choose Your Recharge Plan</h1>
          <p className="mt-2 text-sm text-neutral-400 md:text-base">
            Select the best plan for your number and recharge instantly with fast, secure
          </p>
        </div>

        <div className="mx-auto mt-8 rounded-2xl bg-[#eaf6ff] px-5 py-6 shadow-sm ring-1 ring-black/5 md:px-7 md:py-7">
          <div className="grid gap-3 md:grid-cols-[180px_1fr_220px_260px]">
            <div className="flex items-center gap-2 rounded-xl bg-[#f8f6f7] px-4 py-3 ring-1 ring-black/10">
              <span className="text-lg">🇮🇳</span>
              <span className="text-sm font-semibold text-neutral-900">+91</span>
              <ChevronDown className="ml-auto h-4 w-4 text-neutral-400" />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 ring-1 ring-black/10">
              <Input
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="+91 9999999999"
                className="h-8 rounded-none border-0 bg-transparent p-0 text-sm font-medium text-neutral-900 shadow-none placeholder:text-neutral-400 focus-visible:border-transparent focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-black/10">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">{operator || '—'}</span>
                {detecting ? <span className="text-xs text-neutral-400">…</span> : null}
              </div>
              <button
                type="button"
                className="text-xs font-medium text-[var(--hero-cta-orange)] underline underline-offset-2"
                onClick={() => setOperatorDialogOpen(true)}
              >
                Change
              </button>
            </div>
            <div className="rounded-xl bg-[#f8f6f7] px-4 py-3 text-[11px] text-neutral-600 ring-1 ring-black/10">
              Recharge will be sent to
              <div className="mt-1 text-[11px] font-semibold text-neutral-700">
                +91-{localPhone || '__________'} {operator ? ` ${operator}, India` : ''}
              </div>
            </div>
          </div>
        </div>

        {showPlansSection ? (
          <>
            {!operatorReady ? (
              <div className="mx-auto mt-10 max-w-2xl rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
                <p className="text-sm font-semibold text-neutral-900">Select your mobile operator</p>
                <p className="mt-2 text-xs text-neutral-500">
                  Operator detection uses the catalog database. Choose your operator to load available plans.
                </p>
                <Button className="mt-4" onClick={() => setOperatorDialogOpen(true)}>
                  Choose operator
                </Button>
              </div>
            ) : null}

            {operatorReady ? (
            <>
            <div className="mt-10 flex flex-col items-center justify-between gap-4 md:flex-row">
              <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full md:w-auto">
                <TabsList className="h-12 rounded-full bg-transparent p-0 shadow-none ring-0">
                  {tabs.map((t) => (
                    <TabsTrigger
                      key={t.id}
                      value={t.id}
                      className={cn(
                        'h-10 rounded-full px-6 text-[11px] font-bold uppercase tracking-[0.12em]',
                        'data-[state=active]:bg-neutral-200/80 data-[state=active]:text-[var(--hero-cta-orange)] data-[state=active]:shadow-none',
                        'data-[state=inactive]:text-neutral-700 data-[state=inactive]:bg-transparent',
                      )}
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="flex w-full items-center justify-end gap-3 md:w-auto">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Filter by:</span>
                <Select value={sort} onValueChange={(v) => setSort(v as any)}>
                <SelectTrigger className="h-11 w-[190px] rounded-full bg-[#f8f6f7] shadow-none ring-1 ring-black/10">
                    <SelectValue placeholder="Popular" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popular">Popular</SelectItem>
                    <SelectItem value="price">Price Low-High</SelectItem>
                    <SelectItem value="validity">Validity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {loadingPlans ? (
                <div className="space-y-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-white/70 ring-1 ring-black/5" />
                  ))}
                </div>
              ) : visiblePlans.length === 0 ? (
                <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-black/5">
                  <p className="text-sm font-semibold text-neutral-900">No plans available for this operator</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Plans are loaded from the application catalog database. Ask an admin to sync providers in the
                    admin panel, or choose a different operator using Change.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setOperatorDialogOpen(true)}
                  >
                    Choose operator
                  </Button>
                </div>
              ) : (
                visiblePlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_18px_44px_-34px_rgba(15,23,42,0.35)]"
                  >
                    <div className="grid items-stretch gap-0 md:grid-cols-[180px_1fr_150px_150px]">
                      <div className="relative flex items-center justify-center bg-white p-4 md:p-5">
                        <div className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-5 text-center">
                          {plan.tag === 'popular' ? (
                            <div className="pointer-events-none absolute right-4 top-4 overflow-hidden rounded-tr-xl">
                              <div className="absolute right-[-36px] top-[6px] rotate-45 bg-[var(--hero-cta-orange)] px-10 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
                                Popular
                              </div>
                            </div>
                          ) : null}
                          <p className="text-2xl font-extrabold text-neutral-900">INR {plan.price_inr}</p>
                          <p className="mt-1 text-[11px] font-bold text-neutral-700">(EURO - €{plan.price_eur})</p>
                        </div>
                      </div>

                      <div className="border-t border-neutral-100 bg-white px-5 py-4 md:border-l md:border-t-0 md:py-5">
                        <div className="grid grid-cols-3 items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                              <PhoneCall className="h-4 w-4 text-neutral-700" />
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-neutral-700">Unlimited</p>
                              <p className="text-[11px] text-neutral-500">Calls</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                              <Wifi className="h-4 w-4 text-neutral-700" />
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-neutral-700">{plan.data || '2GB/Day'}</p>
                              <p className="text-[11px] text-neutral-500">Data</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                              <MessageSquareText className="h-4 w-4 text-neutral-700" />
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-neutral-700">{plan.sms || '100 SMS/Day'}</p>
                              <p className="text-[11px] text-neutral-500">SMS</p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 border-t border-neutral-200/70 pt-3 text-[11px] text-neutral-600">
                          <span className="font-semibold text-neutral-800">{operator || '—'}</span>
                          <span className="ml-2">{plan.benefits || 'Thanks app: Free hello tunes + Wynk music'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center border-t border-neutral-100 bg-white px-4 py-4 md:border-l md:border-t-0">
                        <div className="text-center">
                          <span className="mx-auto mb-1 flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                            <CalendarDays className="h-4 w-4 text-neutral-700" />
                          </span>
                          <p className="text-sm font-bold text-neutral-900">{plan.validity || '28 Days'}</p>
                          <p className="text-[11px] text-neutral-500">Validity</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-center border-t border-neutral-100 bg-white px-4 py-4 md:border-l md:border-t-0">
                        <Button
                          className={cn(
                            'h-9 rounded-full bg-[var(--hero-cta-orange)] px-6 text-[11px] font-bold uppercase tracking-wide text-white shadow-none hover:brightness-105',
                          )}
                          onClick={() => onBuy(plan)}
                        >
                          Buy Now
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-10 text-center text-sm text-neutral-600">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-violet-600/10 text-violet-700">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <p className="font-semibold text-neutral-900">Instant Top-Up</p>
                  <p className="text-xs text-neutral-500">In seconds</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700">
                  <span className="text-sm font-bold">✓</span>
                </span>
                <div className="text-left">
                  <p className="font-semibold text-neutral-900">100% Secure</p>
                  <p className="text-xs text-neutral-500">Safe payments</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-orange-600/10 text-orange-700">
                  <span className="text-sm font-bold">%</span>
                </span>
                <div className="text-left">
                  <p className="font-semibold text-neutral-900">Best Rates</p>
                  <p className="text-xs text-neutral-500">No hidden fees</p>
                </div>
              </div>
            </div>
            </>
            ) : null}
          </>
        ) : (
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <p className="text-center text-sm font-semibold text-neutral-900">Enter your mobile number to see plans</p>
            <p className="mt-2 text-center text-xs text-neutral-500">
              Once your operator is detected, available recharge plans will populate below.
            </p>
          </div>
        )}

        <Dialog open={operatorDialogOpen} onOpenChange={setOperatorDialogOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Choose operator</DialogTitle>
              <DialogDescription>Select your operator for this number.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <Select value={selectedProviderCode} onValueChange={setSelectedProviderCode} disabled={providersLoading || providers.length === 0}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={providersLoading ? 'Loading operators…' : 'Select operator'} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOperatorDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-[var(--hero-cta-orange)] text-white hover:brightness-105"
                disabled={!selectedProviderCode}
                onClick={() => {
                  const chosen = providers.find((p) => p.code === selectedProviderCode)
                  if (!chosen) return
                  setManualOperatorOverride(true)
                  setOperator(chosen.shortName || chosen.name)
                  setResolvedProviderCode(chosen.code)
                  setOperatorDialogOpen(false)
                }}
              >
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}


