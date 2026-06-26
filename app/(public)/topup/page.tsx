'use client'

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CalendarDays, Check, ChevronDown, MessageSquareText, PhoneCall, Sparkles, Wifi } from 'lucide-react'
import { useTopupStore, type TopupPlan } from '@/store/topupStore'
import { getDialCode } from '@/lib/lcr/countries'
import { buildInternationalMobile } from '@/lib/lcr/countries'
import { flagEmojiFromIso } from '@/lib/lcr/countries'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { countriesList, getFlagEmoji, validateNationalPhoneDigits } from '@/lib/country-codes'
import { formatPlanRechargeValue } from '@/lib/catalog/plan-recharge-value'
import {
  computeRechargeProcessingFeeAmount,
  DEFAULT_RECHARGE_PROCESSING_FEES,
  parseRechargeProcessingFees,
  type RechargeProcessingFees,
} from '@/lib/settings/recharge-processing-fees'
import { englishPlanDisplayFields } from '@/lib/catalog/plan-text-english'
import { useAuthStore } from '@/lib/stores'
import { buildUserAuthHeaders } from '@/lib/auth/get-user-id-from-request'

function cleanOperatorName(name: string): string {
  let val = (name ?? '').trim()
  if (!val) return ''
  const suffixPattern = /\s+(India|Mexico|Jamaica|Puerto\s+Rico|IND|MX|JM|PR|NGA|GHA|KEN|PHL|IDN|BGD|USA|GBR|ESP|FRA|DEU|ITA|AFG|GTM|GTM)$/i
  return val.replace(suffixPattern, '').trim()
}

/**
 * Parses free-text plan name + benefits to extract structured specs.
 * Handles multilingual text (EN/ES) from DT One / internal catalog.
 */
function parsePlanSpecs(planName: string, benefits: string): {
  data: string | null
  calls: string | null
  sms: string | null
  validity: string | null
} {
  const text = `${planName} ${benefits}`.toLowerCase()

  // ---- DATA ----
  // Matches: "3 GB", "1.5GB", "2GB/Day", "1 GB/day", "datos ilimitados", "unlimited data"
  let data: string | null = null
  if (/\bdatos?\s+ilimitados?|unlimited\s+data/i.test(text)) {
    // Check throttle hint e.g. "after 20GB speed throttled"
    const throttleM = text.match(/(?:after\s+using\s+|después de usar\s*)([\d.]+\s*gb)/i)
    data = throttleM ? `Unlimited (${throttleM[1].toUpperCase()} FUP)` : 'Unlimited'
  } else {
    const dataM = text.match(/(\d+(?:\.\d+)?\s*(?:gb|mb)(?:\/day|\/día)?)/i)
    if (dataM) data = dataM[1].toUpperCase().replace('DíA', 'Day').replace('DIA', 'Day')
  }

  // ---- CALLS ----
  let calls: string | null = null
  if (/\bul\s+calls?|unlimited\s+(?:local|calls?|voice)|llamadas?\s+(locales?|ilimitadas?)|ilimitad[ao]\s+llamadas?/i.test(text)) {
    calls = 'Unlimited'
  } else if (/std\s+(?:and|y)\s+roaming/i.test(text)) {
    calls = 'Unlimited'
  } else {
    // talktime amount e.g. "Talktime of INR 7.47" or "tiempo de conversación de INR 7.47"
    const ttM = text.match(/(?:talktime\s+of|tiempo\s+de\s+conversaci[oó]n\s+de)\s+(?:inr|rs\.?)\s*([\d.]+)/i)
    if (ttM) calls = `₹${ttM[1]} talktime`
  }

  // ---- SMS ----
  let sms: string | null = null
  const smsM = text.match(/(\d+)\s*sms\s*(?:\/day|\/día|per day)?/i)
  if (smsM) sms = `${smsM[1]} SMS`
  else if (/unlimited\s+sms|sms\s+ilimitados?/i.test(text)) sms = 'Unlimited'

  // ---- VALIDITY ----
  let validity: string | null = null
  // "28 Días", "28 days", "1 Day", "válido por 1 día"
  const dayM = text.match(/(\d+)\s*d[íi]as?\b|(\d+)\s*days?\b|v[aá]lid(?:o|ez)\s+por\s+(\d+)\s*d[íi]as?/i)
  if (dayM) {
    const days = parseInt(dayM[1] ?? dayM[2] ?? dayM[3] ?? '0', 10)
    validity = days === 1 ? '1 Day' : `${days} Days`
  }

  return { data, calls, sms, validity }
}

/**
 * Classifies a plan into topup, unlimited, or data pack based on its name and benefits.
 */
function classifyPlanType(planName: string, benefits: string, dbType?: string): 'topup' | 'unlimited' | 'data' {
    // Trust catalog type first
  if (dbType === 'topup') {
    return 'topup'
  }

  if (dbType === 'unlimited') {
    return 'unlimited'
  }

  if (dbType === 'data') {
    return 'data'
  }

  const text = `${planName} ${benefits}`.toLowerCase()

  // 1. Unlimited Pack (unlimited calls/voice or combo packs)
  const hasUnlimitedCalls =
    /unlimited\s+(?:local|calls?|voice|minutes|mins|talk)/i.test(text) ||
    /llamadas?\s+(?:locales?\s+)?ilimitadas?/i.test(text) ||
    /minutos\s+(?:de\s+voz\s+)?ilimitados?/i.test(text) ||
    /ilimitad[ao]\s+llamadas?/i.test(text) ||
    /ilimitados?\s+minutos?/i.test(text) ||
    /\bul\s+calls?\b/i.test(text) ||
    /\bul\s+voice\b/i.test(text) ||
    /\bcombo\b/i.test(text) ||
    /std\s+(?:and|y)\s+roaming/i.test(text) ||
    /roaming\s+ilimitado/i.test(text) ||
    /llamadas\s+y\s+sms\s+ilimitados/i.test(text) ||
    /minutos\s+ilimitados/i.test(text) ||
    /habla\s+ilimitado/i.test(text)

  if (hasUnlimitedCalls) {
    return 'unlimited'
  }

  // 2. Data Pack (internet, data, GB, MB, etc. but without unlimited voice)
  const hasData =
    /\b\d+(?:\.\d+)?\s*(?:gb|mb)\b/i.test(text) ||
    /\bdatos\b/i.test(text) ||
    /\bdata\b/i.test(text) ||
    /\binternet\b/i.test(text) ||
    /\bnavegar\b/i.test(text) ||
    /\bnavegaci[oó]n\b/i.test(text) ||
    /\bdatos\s+ilimitados\b/i.test(text) ||
    /\bunlimited\s+data\b/i.test(text) ||
    /\bwhatsapp\b/i.test(text) ||
    /\bfacebook\b/i.test(text) ||
    /\binstagram\b/i.test(text) ||
    /\btiktok\b/i.test(text) ||
    /\bredes\s+sociales\b/i.test(text)

  if (hasData) {
    return 'data'
  }

  // 3. Fallback to database/catalog type if it is specific
  if (dbType === 'unlimited' || dbType === 'data') {
    return dbType
  }

  // 4. Default / Top-up
  return 'topup'
}

function removeOperatorName(text: string, operatorName: string): string {
  let val = (text ?? '').trim()
  if (!val || !operatorName || operatorName.toLowerCase() === 'unknown') return val

  const escapedOp = operatorName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const regex = new RegExp(`\\b${escapedOp}\\b|${escapedOp}`, 'gi')

  let cleaned = val.replace(regex, '')
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-–—/|:.]\s*/, '')
    .replace(/\s*[-–—/|:.]\s*$/, '')
    .trim()

  return cleaned || val
}

function elaboratePlanDescription(
  plan: TopupPlan,
  countryCode: string,
  specs: ReturnType<typeof parsePlanSpecs>
): string {
  const currentDesc = (plan.benefits ?? '').trim()
  const isTooSmall = !currentDesc || currentDesc.length <= 15 || currentDesc.toLowerCase() === (plan.planName ?? '').toLowerCase()

  if (!isTooSmall) {
    return currentDesc
  }

  const rechargeLabel = formatPlanRechargeValue(plan.recharge_amount, plan.recharge_currency)

  const commonCurrencies: Record<string, string> = {
    IN: 'INR (₹)',
    US: 'USD ($)',
    GB: 'GBP (£)',
    MX: 'MXN ($)',
    NG: 'NGN (₦)',
    GH: 'GHS (GH₵)',
    KE: 'KES (KSh)',
    JM: 'JMD (J$)',
    PH: 'PHP (₱)',
    BD: 'BDT (৳)',
    PK: 'PKR (₨)',
    LK: 'LKR (₨)',
    NP: 'NPR (₨)',
    AE: 'AED',
    SA: 'SAR (SR)',
    EG: 'EGP',
    TR: 'TRY (₺)',
    BR: 'BRL (R$)',
    CO: 'COP (Col$)',
    CA: 'CAD (C$)',
    AU: 'AUD (A$)',
    ZA: 'ZAR (R)',
    ID: 'IDR (Rp)',
    MY: 'MYR (RM)',
    SG: 'SGD (S$)',
    TH: 'THB (฿)',
    VN: 'VND (₫)',
  }
  const countryUpper = countryCode.toUpperCase()
  const localCurrency = commonCurrencies[countryUpper] || 'the local currency'

  const numMatch = currentDesc.match(/[\d.,]+/) || (plan.planName ?? '').match(/[\d.,]+/)
  const extractedValue = numMatch ? numMatch[0] : null
  const localValueText = extractedValue 
    ? `${extractedValue} in ${localCurrency}` 
    : `the local currency equivalent`

  if (plan.type === 'topup') {
    const talktimeAmt = specs.calls && specs.calls !== 'Unlimited' ? specs.calls : rechargeLabel
    const baseDesc = currentDesc ? ` (${currentDesc})` : ''
    return `Instant airtime top-up plan${baseDesc}. This plan delivers standard talktime credit of approximately ${localValueText}, valued at ${rechargeLabel}. Perfect for making local/international calls, sending SMS, or using mobile data at standard operator base tariffs.`
  }

  if (plan.type === 'data') {
    const dataAmt = plan.data || specs.data || 'high-speed'
    const validityText = plan.validity && plan.validity !== 'No Expiry' ? `for ${plan.validity}` : 'with standard validity'
    const baseDesc = currentDesc ? ` (${currentDesc})` : ''
    return `High-speed internet mobile data pack${baseDesc}. Provides ${dataAmt} data capacity ${validityText}, priced at ${rechargeLabel}, suitable for ${localValueText}. Ideal for internet browsing, streaming video, downloading files, and social media connectivity.`
  }

  return currentDesc
}


type OperatorDetectResponse = { operator: string; country: string; providerCode?: string; source?: string }
type DbProvider = { code: string; name: string; shortName: string }
type DbPlan = TopupPlan

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'topup', label: 'Top-Up' },
  { id: 'unlimited', label: 'Unlimited Pack' },
  { id: 'data', label: 'Data Pack' },
] as const

function TopupPlanSelectionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const { countryCode, phoneNumber, operator, setPhoneDetails, setOperator, selectPlan, calculatePricing, setCheckoutSession } =
    useTopupStore()
  const selectedCountry = useMemo(() => {
    return countriesList.find((c) => c.code.toUpperCase() === countryCode.toUpperCase())
  }, [countryCode])

  const dialPrefix = selectedCountry ? selectedCountry.dialCode : getDialCode(countryCode)
  const countryFlag = selectedCountry ? selectedCountry.flag : flagEmojiFromIso(countryCode)

  const [localPhone, setLocalPhone] = useState(phoneNumber)
  const [openCountry, setOpenCountry] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [plans, setPlans] = useState<TopupPlan[]>([])
  const [resolvedProviderCode, setResolvedProviderCode] = useState<string | undefined>()
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('all')
  const [sort, setSort] = useState<'price-asc' | 'price-desc'>('price-asc')

  const [operatorDialogOpen, setOperatorDialogOpen] = useState(false)
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providers, setProviders] = useState<DbProvider[]>([])
  const [selectedProviderCode, setSelectedProviderCode] = useState<string>('')
  const [manualOperatorOverride, setManualOperatorOverride] = useState<boolean>(false)
  const [phoneSubmitError, setPhoneSubmitError] = useState<string | null>(null)
  const [buyingPlanId, setBuyingPlanId] = useState<string | null>(null)
  const [processingFeePercents, setProcessingFeePercents] = useState<RechargeProcessingFees>(
    DEFAULT_RECHARGE_PROCESSING_FEES,
  )

  const phoneValidation = useMemo(
    () => validateNationalPhoneDigits(localPhone, countryCode),
    [localPhone, countryCode],
  )
  const phoneFieldError =
    phoneSubmitError ??
    (localPhone.trim().length > 0 && !phoneValidation.valid ? phoneValidation.error : null)

  useEffect(() => {
    const loadFees = async () => {
      try {
        const res = await fetch('/api/settings/recharge-processing-fees', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        setProcessingFeePercents(parseRechargeProcessingFees(data))
      } catch {
        // keep default
      }
    }
    void loadFees()
  }, [])
  const urlCountryCode = (searchParams.get('country') ?? '').trim().toUpperCase()

  useEffect(() => {
    const applyCountryFromUrl = () => {
      if (!urlCountryCode || !/^[A-Z]{2}$/.test(urlCountryCode)) return
      if (!countriesList.some((c) => c.code.toUpperCase() === urlCountryCode)) return
      setLocalPhone('')
      setPhoneSubmitError(null)
      setPhoneDetails({ countryCode: urlCountryCode, phoneNumber: '' })
    }

    applyCountryFromUrl()
    return useTopupStore.persist.onFinishHydration(applyCountryFromUrl)
  }, [urlCountryCode, setPhoneDetails])

  const effectiveOperatorId = resolvedProviderCode || selectedProviderCode
  const operatorReady = Boolean(effectiveOperatorId) || (Boolean(operator) && operator.toLowerCase() !== 'unknown')
  const showPlans = operatorReady

  useEffect(() => {
    setPhoneDetails({ countryCode, phoneNumber: localPhone })
  }, [countryCode, localPhone, setPhoneDetails])

  // Reset operator state when country changes — not on every phone digit (that was clearing plans mid-entry).
  useEffect(() => {
    setManualOperatorOverride(false)
    setSelectedProviderCode('')
    setResolvedProviderCode(undefined)
    setOperator('')
    setPhoneSubmitError(null)
  }, [countryCode, setOperator])

  useEffect(() => {
    const run = async () => {
      if (manualOperatorOverride) return
      if (!phoneValidation.digits || phoneValidation.digits.length < phoneValidation.minDigits) {
        setResolvedProviderCode(undefined)
        setSelectedProviderCode('')
        setOperator('')
        return
      }
      setDetecting(true)
      try {
        // Prepend the selected country's dial prefix if not already present
        // to ensure detection happens within the chosen country instead of matching other countries' prefixes.
        const formattedPhone = localPhone.startsWith(dialPrefix)
          ? localPhone
          : `${dialPrefix}${localPhone}`

        const res = await fetch('/api/operator/detect', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: formattedPhone, countryCode }),
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
  }, [localPhone, countryCode, dialPrefix, setOperator, manualOperatorOverride, phoneValidation.digits, phoneValidation.minDigits])

  // Auto-detect is handled automatically, manual selection via form Select dropdown

  // Fetch providers list automatically whenever countryCode changes in background
  useEffect(() => {
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
      } catch (err) {
        console.error('Failed to load providers:', err)
      } finally {
        setProvidersLoading(false)
      }
    }
    void loadProviders()
  }, [countryCode])

  // Keep operator dropdown in sync with auto-detect / manual selection.
  useEffect(() => {
    if (!providers.length) return
    if (manualOperatorOverride && selectedProviderCode) return

    const initial =
      resolvedProviderCode && providers.some((m) => m.code === resolvedProviderCode)
        ? resolvedProviderCode
        : ''

    setSelectedProviderCode(initial)

    if (initial) {
      const chosen = providers.find((p) => p.code === initial)
      if (chosen && (!operator || operator === 'Unknown' || operator === '')) {
        setOperator(chosen.shortName || chosen.name)
      }
    }
  }, [resolvedProviderCode, providers, operator, setOperator, manualOperatorOverride, selectedProviderCode])



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

        const res = await fetch(`/api/plans?${params}`, { credentials: 'include', cache: 'no-store' })
        const json = (await res.json().catch(() => ({}))) as { plans?: DbPlan[]; error?: string }
        const raw = Array.isArray(json.plans) ? json.plans : []
        // Filter out plans with zero/negative prices only; keep -1 validity (DT One uses it for 'no expiry')
        console.log('Fetched plans:', raw)
        const valid = raw.filter((p) => {
          const recharge = Number(p.recharge_amount ?? 0)
          if (recharge > 0) return true
          return p.price_inr > 0 || p.price_eur > 0
        })
        // Normalize -1 validity to a human-readable label
        const normalized = valid.map((p) => {
          const english = englishPlanDisplayFields({
            planName: p.planName,
            benefits: p.benefits,
            validity: p.validity,
          })
          const resolvedType = classifyPlanType(english.planName, english.benefits, p.type)
          const cleanName = removeOperatorName(english.planName, operator)
          const cleanBenefits = removeOperatorName(english.benefits, operator)
          const specs = parsePlanSpecs(english.planName, english.benefits)

          const vNum = parseInt(english.validity, 10)
          const validityVal = resolvedType === 'topup'
            ? 'Life Time'
            : (Number.isFinite(vNum) && vNum <= 0) ? 'No Expiry' : (english.validity || p.validity)

          const elaboratedBenefits = elaboratePlanDescription(
            { ...p, planName: cleanName, benefits: cleanBenefits, type: resolvedType, validity: validityVal },
            countryCode,
            specs
          )

          return {
            ...p,
            planName: cleanName,
            benefits: elaboratedBenefits,
            validity: validityVal,
            type: resolvedType
          }
        })
        setPlans(normalized)
        console.log('Normalized plans:', normalized)
      } catch (err) {
        console.error('Failed to load plans:', err)
        setPlans([])
      } finally {
        setLoadingPlans(false)
      }
    }
    void load()
  }, [showPlans, operator, countryCode, effectiveOperatorId])

  const visiblePlans = useMemo(() => {
    let rows = [...plans]
    if (tab !== 'all') rows = rows.filter((p) => p.type === tab)

    const priceOf = (p: TopupPlan) => p.recharge_amount ?? p.price_eur ?? p.price_inr ?? 0
    const effectiveSort = tab === 'all' ? 'price-asc' : sort

    if (effectiveSort === 'price-asc') {
      rows = rows.sort((a, b) => priceOf(a) - priceOf(b))
    } else {
      rows = rows.sort((a, b) => priceOf(b) - priceOf(a))
    }
    return rows
  }, [plans, tab, sort])

  const onBuy = async (plan: TopupPlan) => {
    if (!phoneValidation.valid) {
      setPhoneSubmitError(phoneValidation.error ?? 'Enter a valid mobile number for this country')
      const el = document.getElementById('phone-input')
      if (el) el.focus()
      return
    }
    if (!effectiveOperatorId) {
      setPhoneSubmitError('Select an operator to continue')
      return
    }
    setPhoneSubmitError(null)
    const subtotal =
      Number(plan.recharge_amount) > 0
        ? Number(plan.recharge_amount)
        : Number(plan.price_inr) > 0
          ? Number(plan.price_inr)
          : 0
    const { total: processingFee } = computeRechargeProcessingFeeAmount(subtotal, processingFeePercents)
    const payableAmount = subtotal + processingFee
    const rechargeCurrency = (plan.recharge_currency || 'INR').trim().toUpperCase()

    setBuyingPlanId(plan.id)
    try {
      const res = await fetch('/api/topup/prepare-checkout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...buildUserAuthHeaders(user),
        },
        body: JSON.stringify({
          planId: plan.internalPlanId || plan.id,
          systemPlanId: plan.systemPlanId || plan.id,
          mobileNumber: buildInternationalMobile(countryCode, localPhone),
          operatorId: effectiveOperatorId,
          countryId: countryCode,
          amount: payableAmount,
          currency: rechargeCurrency,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        console.error('Provider selection failed:', data?.error)
        alert(data?.error || 'No provider available for this plan. Please try another plan or operator.')
        return
      }

      selectPlan(plan)
      calculatePricing({ fee: processingFee })
      setCheckoutSession({
        checkoutSessionId: data.checkoutSessionId,
        transactionId: data.transactionId,
        rechargeAttemptId: data.rechargeAttemptId,
        selectedProviderName: data.selectedProviderName,
        operatorProviderId: effectiveOperatorId,
      })
      router.push('/topup/summary')
    } catch (err) {
      console.error('prepare-checkout failed:', err)
      alert('Failed to prepare checkout. Please try again.')
    } finally {
      setBuyingPlanId(null)
    }
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
            <Popover open={openCountry} onOpenChange={setOpenCountry}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl bg-[#fff] px-4 py-3 ring-1 ring-black/10 cursor-pointer transition-colors w-full text-left"
                >
                  {/* <span className="text-lg">{countryFlag}</span> */}
                  <span className="text-sm font-semibold text-neutral-900">+{dialPrefix}</span>
                  <ChevronDown className="ml-auto h-4 w-4 text-neutral-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search country or code..." />
                  <CommandList>
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup className="max-h-[250px] overflow-y-auto">
                      {countriesList.map((c) => (
                        <CommandItem
                          key={c.code}
                          value={`${c.name} ${c.code} ${c.dialCode}`}
                          onSelect={() => {
                            setPhoneDetails({ countryCode: c.code, phoneNumber: localPhone })
                            setOpenCountry(false)
                          }}
                          className="flex items-center justify-between py-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{c.flag}</span>
                            <span className="font-medium text-neutral-900">{c.name}</span>
                            <span className="text-neutral-400 font-normal">(+{c.dialCode})</span>
                          </div>
                          {countryCode.toUpperCase() === c.code.toUpperCase() && (
                            <Check className="h-4 w-4 text-[var(--hero-cta-orange)]" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex flex-col justify-center">
              <div className={cn(
                "flex items-center gap-2 rounded-xl bg-white px-4 py-3 ring-1 transition-all w-full",
                phoneFieldError ? "ring-red-500" : "ring-black/10"
              )}>
                <Input
                  id="phone-input"
                  value={localPhone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, '')
                    setLocalPhone(val)
                    if (phoneSubmitError) setPhoneSubmitError(null)
                  }}
                  placeholder={
                    phoneValidation.minDigits === phoneValidation.maxDigits
                      ? `${phoneValidation.minDigits}-digit mobile number`
                      : `${phoneValidation.minDigits}–${phoneValidation.maxDigits} digit mobile number`
                  }
                  maxLength={phoneValidation.maxDigits}
                  inputMode="numeric"
                  className="h-8 rounded-none border-0 bg-transparent p-0 text-sm font-medium text-neutral-900 shadow-none placeholder:text-neutral-400 focus-visible:border-transparent focus-visible:ring-0 w-full"
                />
              </div>
              {phoneFieldError && (
                <span className="text-[10px] text-red-500 mt-1 font-semibold pl-1">
                  {phoneFieldError}
                </span>
              )}
            </div>
            <div className="flex items-center rounded-xl bg-white ring-1 ring-black/10 w-full px-2">
              <Select
                value={selectedProviderCode || resolvedProviderCode || ''}
                onValueChange={(val) => {
                  const chosen = providers.find((p) => p.code === val)
                  if (chosen) {
                    setManualOperatorOverride(true)
                    setOperator(chosen.shortName || chosen.name)
                    setResolvedProviderCode(chosen.code)
                    setSelectedProviderCode(chosen.code)
                  }
                }}
                disabled={providersLoading || providers.length === 0}
              >
                <SelectTrigger className="h-12 border-0 bg-transparent shadow-none ring-0 focus:ring-0 focus-visible:ring-0 text-sm font-semibold text-neutral-900 w-full justify-between">
                  <SelectValue placeholder={providersLoading ? 'Loading operators…' : 'Select operator'} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.code} value={p.code} className="cursor-pointer">
                      {p.shortName || p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl bg-[#f8f6f7] px-4 py-3 text-[11px] text-neutral-600 ring-1 ring-black/10">
              Recharge will be sent to
              <div className="mt-1 text-[11px] font-semibold text-neutral-700">
                +{dialPrefix}-{localPhone || '__________'}{operator ? ` ${cleanOperatorName(operator)}` : ''}
              </div>
            </div>
          </div>
        </div>

        {!showPlans ? (
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <p className="text-center text-sm font-semibold text-neutral-900">Select country and operator to see plans</p>
            <p className="mt-2 text-center text-xs text-neutral-500">
              Once an operator is selected, available recharge plans will populate below.
            </p>
          </div>
        ) : (
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

              {tab !== 'all' ? (
                <div className="flex w-full items-center justify-end gap-3 md:w-auto">
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Filter by:</span>
                  <Select value={sort} onValueChange={(v) => setSort(v as 'price-asc' | 'price-desc')}>
                    <SelectTrigger className="h-11 w-[200px] rounded-full bg-[#f8f6f7] shadow-none ring-1 ring-black/10">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price-asc">Price: Low → High</SelectItem>
                      <SelectItem value="price-desc">Price: High → Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
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
                    admin panel, or choose a different operator.
                  </p>
                </div>
              ) : (
                visiblePlans.map((plan) => {
                  const specs = parsePlanSpecs(plan.planName ?? '', plan.benefits ?? '')
                  // Use DB validity first, fallback to parsed
                  const displayValidity = (plan.validity && plan.validity !== 'No Expiry' && plan.validity.trim())
                    ? plan.validity
                    : specs.validity

                  const specItems: { icon: React.ReactNode; label: string; value: string }[] = []
                  if (specs.calls) specItems.push({ icon: <PhoneCall className="h-4 w-4 text-neutral-700" />, label: 'Calls', value: specs.calls })
                  if (plan.data || specs.data) specItems.push({ icon: <Wifi className="h-4 w-4 text-neutral-700" />, label: 'Data', value: plan.data ?? specs.data ?? '' })
                  if (specs.sms) specItems.push({ icon: <MessageSquareText className="h-4 w-4 text-neutral-700" />, label: 'SMS', value: specs.sms })

                  return (
                    <div
                      key={plan.id}
                      className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_18px_44px_-34px_rgba(15,23,42,0.35)]"
                    >
                      <div className="grid items-stretch gap-0 md:grid-cols-[180px_1fr_150px_150px]">
                        {/* Price column */}
                        <div className="relative flex items-center justify-center bg-white p-4 md:p-5">
                          <div className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-5 text-center">
                            {plan.tag === 'popular' ? (
                              <div className="pointer-events-none absolute right-4 top-4 overflow-hidden rounded-tr-xl">
                                <div className="absolute right-[-36px] top-[6px] rotate-45 bg-[var(--hero-cta-orange)] px-10 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
                                  Popular
                                </div>
                              </div>
                            ) : null}
                            <p className="text-2xl font-extrabold text-neutral-900">
                              {formatPlanRechargeValue(plan.recharge_amount, plan.recharge_currency)}
                            </p>
                          </div>
                        </div>

                        {/* Specs + description column */}
                        <div className="border-t border-neutral-100 bg-white px-5 py-4 md:border-l md:border-t-0 md:py-5">
                          {plan.type === 'topup' && (
                            (() => {
                              const ttMatch = (plan.benefits ?? '').match(/(?:talktime\s+of|talktime|tiempo\s+de\s+conversaci[oó]n|valor|cr[eé]dito)\s*(?:inr|rs\.?|eur|€)?\s*([\d.,]+)/i)
                              const talktimeText = ttMatch
                                ? `Talktime Plan of ${ttMatch[0]}`
                                : `Talktime Plan of ${formatPlanRechargeValue(plan.recharge_amount, plan.recharge_currency)}`
                              return (
                                <div className="mb-3.5 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-500/20 w-fit">
                                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                                  {talktimeText}
                                </div>
                              )
                            })()
                          )}
                          {plan.type === 'data' && (
                            (() => {
                              const dataMatch = plan.data || specs.data
                              const dataText = dataMatch
                                ? `Data Pack of ${dataMatch}`
                                : `Data Pack Plan`
                              return (
                                <div className="mb-3.5 flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-500/20 w-fit">
                                  <Wifi className="h-3.5 w-3.5 text-blue-600" />
                                  {dataText}
                                </div>
                              )
                            })()
                          )}
                          {specItems.length > 0 ? (
                            <div className={cn('grid items-center gap-3', specItems.length === 1 ? 'grid-cols-1' : specItems.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                              {specItems.map((s) => (
                                <div key={s.label} className="flex items-center gap-2">
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                                    {s.icon}
                                  </span>
                                  <div>
                                    <p className="text-xs font-semibold text-neutral-700">{s.value}</p>
                                    <p className="text-[11px] text-neutral-500">{s.label}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className={cn('text-[11px] text-neutral-600', specItems.length > 0 ? 'mt-4 border-t border-neutral-200/70 pt-3' : '')}>
                            <span className="font-semibold text-neutral-800 mr-2">{cleanOperatorName(plan.planName ?? '')}</span>
                            {plan.benefits && plan.benefits !== plan.planName && (
                              <span>{plan.benefits}</span>
                            )}
                          </div>
                        </div>

                        {/* Validity column */}
                        <div className="flex items-center justify-center border-t border-neutral-100 bg-white px-4 py-4 md:border-l md:border-t-0">
                          <div className="text-center">
                            <span className="mx-auto mb-1 flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                              <CalendarDays className="h-4 w-4 text-neutral-700" />
                            </span>
                            {displayValidity ? (
                              <p className="text-sm font-bold text-neutral-900">{displayValidity}</p>
                            ) : (
                              <p className="text-xs text-neutral-400 italic">—</p>
                            )}
                            <p className="text-[11px] text-neutral-500">Validity</p>
                          </div>
                        </div>

                        {/* Buy button column */}
                        <div className="flex items-center justify-center border-t border-neutral-100 bg-white px-4 py-4 md:border-l md:border-t-0">
                          <Button
                            className={cn(
                              'h-9 rounded-full bg-[var(--hero-cta-orange)] px-6 text-[11px] font-bold uppercase tracking-wide text-white shadow-none hover:brightness-105',
                            )}
                            onClick={() => onBuy(plan)}
                            disabled={buyingPlanId === plan.id}
                          >
                            {buyingPlanId === plan.id ? 'Selecting...' : 'Buy Now'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
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
        )}
      </div>
    </div>
  )
}

export default function TopupPlanSelectionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-6rem)] bg-[#f3f9ff] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--hero-cta-orange)]" />
        </div>
      }
    >
      <TopupPlanSelectionContent />
    </Suspense>
  )
}

