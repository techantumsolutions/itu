'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronDown, ChevronRight, Search, Apple, Play, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRechargeStore, useAuthStore } from '@/lib/stores'
import { useCMSStore, type AppPromoContent, type FAQItem } from '@/lib/cms-store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { OperatorsMarquee } from '@/components/operators-marquee'
import { AdManager } from '@/components/ui/ads/ad-manager'

import { useTopupStore } from '@/store/topupStore'

type CatalogCountry = {
  code: string
  name: string
  flag: string
  dialCode: string
}

/** Default operator logos if CMS items are missing or have no image yet */
const SECTION3_ICON_FALLBACKS = [
  '/landing/section3/icon-recharge.svg',
  '/landing/section3/icon-secure.svg',
  '/landing/section3/icon-support.svg',
] as const

function HowItWorksStepCard({
  imageSrc,
  titleLine1,
  titleLine2,
}: {
  imageSrc: string
  titleLine1: string
  titleLine2: string
}) {
  const src = (imageSrc ?? '').trim()
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-full max-w-[13.5rem] overflow-hidden backdrop-blur-sm">
        <div className=" w-full">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-neutral-400">
              Upload step image
            </div>
          )}
        </div>
      </div>
      <p className="mt-5 text-sm font-semibold text-neutral-700">
        {titleLine1}
        <br />
        {titleLine2}
      </p>
    </div>
  )
}

const FALLBACK_OPERATOR_LOGOS: { src: string; alt: string }[] = [
  { src: '/landing/operators/att.svg', alt: 'AT&T' },
  { src: '/landing/operators/swisscom.svg', alt: 'Swisscom' },
  { src: '/landing/operators/safaricom.svg', alt: 'Safaricom' },
  { src: '/landing/operators/verizon.svg', alt: 'Verizon' },
  { src: '/landing/operators/airtel.svg', alt: 'Airtel' },
  { src: '/landing/operators/vodafone.svg', alt: 'Vodafone' },
  { src: '/landing/operators/celcomdigi.svg', alt: 'CelcomDigi' },
]

const DEFAULT_HERO_GLOBE = '/landing/hero-globe-bg.png'
const DEFAULT_HERO_PHONES = '/landing/hero-phones.png'

function cmsHeroAsset(src: string | undefined, fallback: string) {
  const s = (src ?? '').trim()
  return s || fallback
}

function isDataUrl(src: string) {
  return src.startsWith('data:')
}

function SectionThreeFeatureIcon({ src, alt }: { src: string; alt: string }) {
  const s = (src ?? '').trim()
  if (!s) {
    return (
      <div
        className="mx-auto flex h-[7.5rem] w-[7.5rem] items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 text-[10px] text-neutral-400"
        aria-hidden
      >
        Icon
      </div>
    )
  }
  if (isDataUrl(s)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={s} alt={alt} className="mx-auto h-[7.5rem] w-[7.5rem] object-contain" />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s} alt={alt} className="mx-auto h-[7.5rem] w-[7.5rem] object-contain" />
  )
}

function CountryFlagThumb({ src, alt }: { src: string; alt: string }) {
  const s = (src ?? '').trim()
  if (!s) return <div className="h-7 w-10 rounded-xs bg-neutral-200" aria-hidden />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={s} alt={alt} className="h-7 w-10 rounded-md object-cover ring-1 ring-black/5" />
}

function LandingFaqAccordion({ title, subtitle, items }: { title: string; subtitle: string; items: FAQItem[] }) {
  const rows = useMemo(
    () => [...items].filter((i) => i.isActive).sort((a, b) => a.order - b.order),
    [items],
  )
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    setOpenId((prev) => {
      if (prev && rows.some((r) => r.id === prev)) return prev
      return rows[0]?.id ?? null
    })
  }, [rows])

  if (!rows.length) return null

  return (
    <section className="bg-white py-16 md:py-16" aria-labelledby="landing-faq-heading">
      <div className="container mx-auto max-w-5xl px-4">
        <h2
          id="landing-faq-heading"
          className="text-center text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl"
        >
          {title}
        </h2>
        {(subtitle ?? '').trim() ? (
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-neutral-500 md:mt-5 md:text-base">
            {subtitle}
          </p>
        ) : null}
        <div className="mt-10 border-t border-neutral-200 md:mt-14">
          {rows.map((item) => {
            const open = openId === item.id
            return (
              <div key={item.id} className="border-b border-neutral-200">
                <button
                  type="button"
                  onClick={() => setOpenId((id) => (id === item.id ? null : item.id))}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left outline-none transition-colors hover:bg-neutral-50/80 focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2 md:py-6"
                  aria-expanded={open}
                >
                  <span className="text-[15px] font-medium leading-snug text-neutral-900 md:text-base">
                    {item.question}
                  </span>
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-600 transition-colors',
                      open && 'border-neutral-300 bg-neutral-200/70 text-neutral-800',
                    )}
                    aria-hidden
                  >
                    {open ? (
                      <ChevronDown className="size-4" strokeWidth={2} />
                    ) : (
                      <ChevronRight className="size-4" strokeWidth={2} />
                    )}
                  </span>
                </button>
                {open ? (
                  <div className="pb-5 pr-14 text-sm leading-relaxed text-neutral-500 md:pr-16 md:text-[15px]">
                    {item.answer}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function AppPromoVisualFallback() {
  return (
    <div className="relative flex w-full max-w-sm justify-center pb-4 pt-2 md:max-w-md">
      <div
        className="absolute left-1/2 top-[42%] h-[min(72vw,300px)] w-[min(72vw,300px)] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-inner"
        aria-hidden
      >
        <div className="flex h-full w-full overflow-hidden rounded-full">
          <div className="h-full w-1/2 bg-violet-500" />
          <div className="h-full w-1/2 bg-sky-400" />
        </div>
      </div>
      <div className="relative z-[1] w-[min(48vw,220px)] shrink-0 rounded-[2.25rem] border-[7px] border-white bg-neutral-900 p-1.5 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)]">
        <div className="aspect-[9/19] w-full rounded-[1.65rem] bg-neutral-100" />
      </div>
    </div>
  )
}

function StoreBadgeLink({
  href,
  imageSrc,
  label,
  variant,
}: {
  href: string
  imageSrc: string
  label: string
  variant: 'apple' | 'google'
}) {
  const img = (imageSrc ?? '').trim()
  if (img) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block cursor-pointer rounded-full outline-none ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-neutral-900/25"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- CMS uploads may be data URLs */}
        <img src={img} alt={label} className="h-11 w-auto md:h-12" />
      </a>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-full bg-black px-4 text-white shadow-sm outline-none ring-offset-2 transition hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/30 md:h-12 md:px-5"
    >
      {variant === 'apple' ? (
        <Apple className="h-7 w-7 shrink-0" aria-hidden />
      ) : (
        <Play className="h-7 w-7 shrink-0 fill-current" aria-hidden />
      )}
      <span className="text-left text-[10px] leading-tight md:text-[11px]">
        {variant === 'apple' ? (
          <>
            <span className="block font-medium uppercase tracking-wide text-white/75">Download on the</span>
            <span className="text-sm font-semibold">App Store</span>
          </>
        ) : (
          <>
            <span className="block font-medium uppercase tracking-wide text-white/75">GET IT ON</span>
            <span className="text-sm font-semibold">Google Play</span>
          </>
        )}
      </span>
    </a>
  )
}

function LandingAppDownloadSection({ promo }: { promo: AppPromoContent }) {
  const bg = ((promo.backgroundGradient ?? '').trim()) || 'from-[#e4ecf4] via-[#eef3f8] to-[#f2f6fb]'
  const visual = (promo.sectionImage ?? '').trim()

  return (
    <section className="relative overflow-hidden py-16 md:py-24" aria-labelledby="landing-app-promo-heading">
      <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br', bg)} aria-hidden />
      <div className="container relative z-[1] mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <h2
              id="landing-app-promo-heading"
              className="text-balance text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl"
            >
              {promo.title}
            </h2>
            {(promo.accentSubtitle ?? '').trim() ? (
              <p className="mt-3 text-lg font-semibold text-[var(--hero-cta-orange)] md:text-xl">
                {promo.accentSubtitle}
              </p>
            ) : null}
            {(promo.subtitle ?? '').trim() ? (
              <p className="mx-auto mt-3 max-w-xl text-balance text-base text-neutral-800 md:text-lg lg:mx-0">
                {promo.subtitle}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              {promo.showAppStore ? (
                <StoreBadgeLink
                  href={promo.appStoreUrl || '#'}
                  imageSrc={promo.appStoreBadgeImage}
                  label="Download on the App Store"
                  variant="apple"
                />
              ) : null}
              {promo.showGooglePlay ? (
                <StoreBadgeLink
                  href={promo.googlePlayUrl || '#'}
                  imageSrc={promo.googlePlayBadgeImage}
                  label="Get it on Google Play"
                  variant="google"
                />
              ) : null}
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            {visual ? (
              // eslint-disable-next-line @next/next/no-img-element -- CMS uploads may be data URLs
              <img
                src={visual}
                alt=""
                className="max-h-[min(70vh,440px)] w-auto max-w-full object-contain drop-shadow-md"
              />
            ) : (
              <AppPromoVisualFallback />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function PhoneMockSuccess({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'landing-phone-frame relative aspect-[9/19] w-[min(100%,240px)] bg-gradient-to-b from-neutral-800 to-neutral-950 p-2',
        className,
      )}
    >
      <div className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-black/40" />
      <div className="mt-6 flex h-[calc(100%-2rem)] flex-col overflow-hidden rounded-[1.35rem] bg-white">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <Check className="h-8 w-8" strokeWidth={2.5} />
          </div>
          <p className="text-sm font-semibold text-neutral-900">Recharge Successfully</p>
          <p className="text-[11px] text-neutral-500">Your credit was delivered instantly</p>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { setCountry, setPhoneNumber, resetRecharge } = useRechargeStore()
  const setTopupPhone = useTopupStore((s) => s.setPhoneDetails)
  const { content } = useCMSStore()
  const [catalogCountries, setCatalogCountries] = useState<CatalogCountry[]>([])
  const [selectedCountry, setSelectedCountry] = useState<CatalogCountry | null>(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [countryOpen, setCountryOpen] = useState(false)
  const [operatorCountsByIso, setOperatorCountsByIso] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    resetRecharge()
  }, [resetRecharge])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/countries', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('countries'))))
      .then((data: { countries?: CatalogCountry[] }) => {
        if (cancelled) return
        const rows = Array.isArray(data.countries) ? data.countries : []
        setCatalogCountries(rows)
        if (!selectedCountry && rows.length) {
          setSelectedCountry(rows.find((c) => c.code === 'IN') ?? rows[0] ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogCountries([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gridCountryCodesKey = useMemo(() => {
    const codes = new Set<string>()
    for (const x of content.countriesGrid?.items ?? []) {
      if (!x.isActive) continue
      const c = x.countryCode.trim().toUpperCase()
      if (/^[A-Z]{2}$/.test(c)) codes.add(c)
    }
    return [...codes].sort().join(',')
  }, [content.countriesGrid?.items])

  useEffect(() => {
    if (!gridCountryCodesKey) {
      setOperatorCountsByIso({})
      return
    }
    let cancelled = false
    setOperatorCountsByIso(null)
    void fetch(`/api/countries/operator-counts?codes=${encodeURIComponent(gridCountryCodesKey)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('counts'))))
      .then((data: { counts?: Record<string, number> }) => {
        if (!cancelled) setOperatorCountsByIso(data.counts ?? {})
      })
      .catch(() => {
        if (!cancelled) setOperatorCountsByIso({})
      })
    return () => {
      cancelled = true
    }
  }, [gridCountryCodesKey])

  const handleStartTopUp = () => {
    if (phoneInput && selectedCountry) {
      setCountry({
        code: selectedCountry.code,
        name: selectedCountry.name,
        flag: selectedCountry.flag,
        dialCode: selectedCountry.dialCode,
        dialingInfo: [{ prefix: selectedCountry.dialCode, minLength: 10, maxLength: 15 }],
      })
      setPhoneNumber(phoneInput)
      setTopupPhone({ countryCode: selectedCountry.code, phoneNumber: phoneInput })
    }
    const targetUrl = content.hero.ctaUrl?.trim() || '/topup'
    if (targetUrl.startsWith('http')) {
      window.location.href = targetUrl
    } else {
      router.push(targetUrl)
    }
  }

  const popularCountries = content.popularCountries.filter((c) => c.isActive).sort((a, b) => a.order - b.order)

  const welcomeHero = Boolean(content.hero.showWelcomeBack && user)
  const heroGlobeSrc = cmsHeroAsset(content.hero.backgroundImage, DEFAULT_HERO_GLOBE)
  const heroPhonesSrc = cmsHeroAsset(content.hero.phonesImage, DEFAULT_HERO_PHONES)
  const heroAppStoreBadgeSrc = (content.hero.heroAppStoreBadgeImage ?? '').trim()
  const heroGooglePlayBadgeSrc = (content.hero.heroGooglePlayBadgeImage ?? '').trim()
  const showHeroAppStoreBadge = Boolean(content.appPromo.showAppStore || heroAppStoreBadgeSrc)
  const showHeroGooglePlayBadge = Boolean(content.appPromo.showGooglePlay || heroGooglePlayBadgeSrc)
  const heroStoreBadgesVisible = showHeroAppStoreBadge || showHeroGooglePlayBadge
  const heroStoreBadgesTitle =
    (content.hero.storeBadgesTitle ?? '').trim() ||
    (content.hero.appDownloadLine ?? '').trim() ||
    `Click here to Download ${content.header.logoText} Mobile App`

  const operatorMarqueeLogos = useMemo(() => {
    const slider = content.operatorsSlider
    const items = slider?.items?.filter((x) => x.isActive).sort((a, b) => a.order - b.order) ?? []
    if (!items.length) return FALLBACK_OPERATOR_LOGOS

    const mapped = items.map((x, i) => {
      const src = (x.imageSrc ?? '').trim()
      const fb = FALLBACK_OPERATOR_LOGOS[i % FALLBACK_OPERATOR_LOGOS.length]!
      return {
        src: src || fb.src,
        alt: ((x.alt ?? '').trim()) || fb.alt,
      }
    })
    return mapped.length ? mapped : FALLBACK_OPERATOR_LOGOS
  }, [content.operatorsSlider])

  const titleParts = (content.hero.title || 'Instant International Top-Up\nanytime anywhere')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
  const heroLine1 = welcomeHero ? `Welcome back, ${user?.name}` : (titleParts[0] ?? 'Instant International Top-Up')
  const heroLine2 = welcomeHero ? '' : (titleParts[1] ?? 'anytime anywhere')

  const goRechargeWithCountry = (code: string) => {
    const c = catalogCountries.find((x) => x.code === code)
    if (!c) {
      router.push('/recharge')
      return
    }
    setCountry({
      code: c.code,
      name: c.name,
      flag: c.flag,
      dialCode: c.dialCode,
      dialingInfo: [{ prefix: c.dialCode, minLength: 10, maxLength: 15 }],
    })
    router.push('/recharge')
  }

  return (
    <div className="flex flex-col">
      <div className="container mx-auto px-4 max-w-6xl mt-4">
        <AdManager placement="home_hero" />
      </div>
      {/* Hero — CMS background, overlay, copy; nav reads transparent until scroll */}
      <section
        className={cn(
          'relative overflow-hidden pb-14 pt-20 sm:pb-16 sm:pt-20 md:pb-20 md:pt-40',
          !(content.hero.sectionBgColor ?? '').trim() && 'bg-[var(--hero-navy)]',
        )}
        style={
          (content.hero.sectionBgColor ?? '').trim()
            ? { backgroundColor: content.hero.sectionBgColor.trim() }
            : undefined
        }
      >
        <div className="pointer-events-none absolute inset-0">
          {isDataUrl(heroGlobeSrc) ? (
            // eslint-disable-next-line @next/next/no-img-element -- CMS uploads are data URLs
            <img
              src={heroGlobeSrc}
              alt=""
              className="absolute inset-0 size-full object-cover object-[center_100%]"
            />
          ) : (
            <Image
              src={heroGlobeSrc}
              alt=""
              fill
              className="object-cover object-[center_100%]"
              sizes="100vw"
              priority
            />
          )}
          <div
            className={cn('absolute inset-0 bg-gradient-to-b', content.hero.overlayGradient)}
            aria-hidden
          />
        </div>

        <div className="container relative z-[1] mx-auto px-4 max-w-6xl">
          <div className="grid items-center gap-3 lg:grid-cols-2">
            <div className="mx-auto w-full max-w-xl space-y-6 text-center lg:mx-0 lg:text-left">
              <h1 className="font-sans text-balance text-4xl font-bold leading-[1.08] tracking-tight text-white md:text-5xl lg:text-[3.1rem]">
                {heroLine1}
                {!welcomeHero && heroLine2 ? (
                  <>
                    <br />
                    <span
                      className={cn(!(content.hero.accentLineColor ?? '').trim() && 'text-[var(--hero-cta-orange)]')}
                      style={
                        (content.hero.accentLineColor ?? '').trim()
                          ? { color: content.hero.accentLineColor.trim() }
                          : undefined
                      }
                    >
                      {heroLine2}
                    </span>
                  </>
                ) : null}
              </h1>
              <p className="text-lg font-medium text-white/90 md:text-xl">
                {content.hero.subtitle || 'Fast, Secure, and Hassle-free.'}
              </p>

              <div className="rounded-2xl border border-white/20 bg-[#0d2744]/78 p-5 text-left shadow-xl backdrop-blur-md sm:p-6">
                <p className="text-base font-bold text-white">{content.topupCard.title || 'Send Top-Up'}</p>
                <p className="mt-1 text-sm text-white/80">
                  {content.hero.cardHelperText || 'Enter the phone number you want to recharge'}
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-black/5 transition hover:bg-neutral-50 sm:min-w-[7.5rem]"
                      >
                        {selectedCountry ? (
                          <>
                            <span className="text-lg leading-none">{selectedCountry.flag}</span>
                            <span className="tabular-nums">{selectedCountry.dialCode}</span>
                          </>
                        ) : (
                          <>
                            <Search className="size-4 text-neutral-400" />
                            <span className="text-neutral-500">Code</span>
                          </>
                        )}
                        <ChevronDown className="size-4 text-neutral-400 opacity-70" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(calc(100vw-2rem),22rem)] p-0 sm:w-80" align="start">
                      <Command>
                        <CommandInput placeholder="Search country..." />
                        <CommandList>
                          <CommandEmpty>No country found.</CommandEmpty>
                          <CommandGroup heading="Popular">
                            {popularCountries.map((country) => (
                              <CommandItem
                                key={country.code}
                                value={country.name}
                                onSelect={() => {
                                  const full = catalogCountries.find((c) => c.code === country.code)
                                  if (full) setSelectedCountry(full)
                                  setCountryOpen(false)
                                }}
                              >
                                <span className="mr-2 text-lg">{country.flag}</span>
                                <span className="flex-1">{country.name}</span>
                                <span className="text-sm text-muted-foreground">{country.dialCode}</span>
                                <Check
                                  className={cn(
                                    'ml-2 h-4 w-4',
                                    selectedCountry?.code === country.code ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          <CommandGroup heading="All Countries">
                            {catalogCountries
                              .filter((c) => !popularCountries.find((p) => p.code === c.code))
                              .map((country) => (
                                <CommandItem
                                  key={country.code}
                                  value={country.name}
                                  onSelect={() => {
                                    setSelectedCountry(country)
                                    setCountryOpen(false)
                                  }}
                                >
                                  <span className="mr-2 text-lg">{country.flag}</span>
                                  <span className="flex-1">{country.name}</span>
                                  <span className="text-sm text-muted-foreground">{country.dialCode}</span>
                                  <Check
                                    className={cn(
                                      'ml-2 h-4 w-4',
                                      selectedCountry?.code === country.code ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <div className="relative min-h-12 flex-1">
                    <Input
                      type="tel"
                      placeholder={content.topupCard.placeholder}
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                      className="h-12 rounded-xl border-0 bg-white pr-[7rem] text-base font-medium text-neutral-900 shadow-sm ring-1 ring-black/5 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-[var(--hero-cta-orange)]/35"
                    />
                    <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-2 sm:flex">
                      <span className="text-[11px] font-bold tracking-tight text-[var(--brand-red)]">airtel</span>
                      <button
                        type="button"
                        className="text-[11px] font-medium text-neutral-400 underline-offset-2 hover:text-neutral-700 hover:underline"
                        onClick={() => router.push('/topup')}
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  <Button
                    className="h-12 shrink-0 rounded-full px-6 text-base font-semibold text-white shadow-lg transition hover:brightness-105 sm:px-8"
                    style={{ backgroundColor: 'var(--hero-cta-orange)' }}
                    size="lg"
                    onClick={handleStartTopUp}
                  >
                    {content.hero.ctaText || content.topupCard.buttonText || 'Top-up now'}
                  </Button>
                </div>


              </div>
              {heroStoreBadgesVisible ? (
                <div className="mt-5 space-y-3 pt-5">
                  <p className="text-center text-sm text-white/75 lg:text-left">{heroStoreBadgesTitle}</p>
                  <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
                    {showHeroAppStoreBadge ? (
                      <StoreBadgeLink
                        href={content.appPromo.appStoreUrl || '#'}
                        imageSrc={heroAppStoreBadgeSrc}
                        label="Download on the App Store"
                        variant="apple"
                      />
                    ) : null}
                    {showHeroGooglePlayBadge ? (
                      <StoreBadgeLink
                        href={content.appPromo.googlePlayUrl || '#'}
                        imageSrc={heroGooglePlayBadgeSrc}
                        label="Get it on Google Play"
                        variant="google"
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative flex justify-center lg:justify-end">
              {isDataUrl(heroPhonesSrc) ? (
                // eslint-disable-next-line @next/next/no-img-element -- CMS uploads are data URLs
                <img
                  src={heroPhonesSrc}
                  alt=""
                  width={560}
                  height={620}
                  className="h-auto w-full max-w-[min(100%,500px)] drop-shadow-[0_28px_60px_rgba(0,0,0,0.45)]"
                />
              ) : (
                <Image
                  src={heroPhonesSrc}
                  alt=""
                  width={560}
                  height={620}
                  className="h-auto w-full max-w-[min(100%,500px)] drop-shadow-[0_28px_60px_rgba(0,0,0,0.45)]"
                  priority
                  sizes="(max-width: 1024px) 90vw, 500px"
                />
              )}
            </div>
          </div>
        </div>

      </section>

      {/* Section 2 — image marquee + phone; CMS title/body for screen readers & SEO */}
      <section className="bg-white  ">
        <div className="container mx-auto px-4 w-full max-w-6xl">
          <h2 className="sr-only">{content.operatorsSlider?.sectionTitle ?? ''}</h2>
          <p className="sr-only">{content.operatorsSlider?.sectionBody ?? ''}</p>
          <div className="mx-auto w-full max-w-6xl overflow-hidden">
            <OperatorsMarquee
              logos={operatorMarqueeLogos}
              variant="light"
              durationSec={Math.max(18, (content.operatorsSlider?.marqueeDurationSec || 42) + 8)}
              className="border-0"
            />
          </div>
        </div>
      </section>

      {/* Section 3 — mission + three features (CMS) */}
      <section className="bg-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-balance text-4xl font-light leading-[1.2] tracking-tight text-neutral-800 md:text-4xl lg:text-[2.0rem]">
              {content.sectionThree?.headlineLine1 ?? ''}
              <br />
              {content.sectionThree?.headlineLine2 ?? ''}
            </h2>
            <p className="mx-auto mt-5 max-w-4xl text-pretty text-base leading-relaxed text-neutral-400 md:text-md">
              {content.sectionThree?.description ?? ''}
            </p>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-12 sm:grid-cols-2 md:mt-16 md:grid-cols-3 md:gap-10">
            {(content.sectionThree?.features ?? [])
              .filter((f) => f.isActive)
              .sort((a, b) => a.order - b.order)
              .map((f, idx) => {
                const accentColor = (content.sectionThree?.titleAccentColor ?? '').trim()
                const iconSrc =
                  (f.iconImageSrc ?? '').trim() ||
                  SECTION3_ICON_FALLBACKS[idx % SECTION3_ICON_FALLBACKS.length]!
                return (
                  <div key={f.id} className="text-center">
                    <SectionThreeFeatureIcon src={iconSrc} alt={`${f.titleAccent} ${f.titleRest}`.trim()} />
                    <h3 className="mt-6 text-xl tracking-tight md:text-xl">
                      {f.titleAccent ? (
                        <span
                          className={cn(!accentColor && 'text-[var(--brand-red)]')}
                          style={accentColor ? { color: accentColor } : undefined}
                        >
                          {f.titleAccent}
                        </span>
                      ) : null}
                      {f.titleAccent && f.titleRest ? ' ' : null}
                      {f.titleRest ? (
                        <span className="text-neutral-800">{f.titleRest}</span>
                      ) : null}
                    </h3>
                  </div>
                )
              })}
          </div>
        </div>
      </section>

      {/* How it Work (CMS) */}
      <section className="bg-[#f3f9ff] py-10 md:py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl">
              {content.howItWorks?.title ?? ''}
            </h2>
            <p className="mt-3 text-sm text-neutral-400 md:text-base">
              {content.howItWorks?.subtitle ?? ''}
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-6xl gap-6 sm:grid-cols-2 md:mt-12 md:grid-cols-3 lg:grid-cols-5">
            {(content.howItWorks?.steps ?? [])
              .filter((s) => s.isActive)
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <HowItWorksStepCard
                  key={s.id}
                  imageSrc={s.imageSrc}
                  titleLine1={s.titleLine1}
                  titleLine2={s.titleLine2}
                />
              ))}
          </div>
        </div>
      </section>

      {/* Country grid */}
      <section className="bg-white py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mx-auto mb-10 max-w-3xl text-center md:mb-12">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl">
              {content.countriesGrid?.title ?? ''}
            </h2>
            <p className="mt-3 text-sm text-neutral-500 md:mt-4 md:text-base">
              {content.countriesGrid?.subtitle ?? ''}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(content.countriesGrid?.items ?? [])
              .filter((x) => x.isActive)
              .sort((a, b) => a.order - b.order)
              .map((row) => (
                <div
                  key={row.id}
                  className="relative rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm"
                >
                  {row.isPopular ? (
                    <span className="absolute right-3 top-3 rounded-sm bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                      Popular
                    </span>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <CountryFlagThumb src={row.flagImageSrc} alt={row.countryName} />
                    <p className="text-sm font-semibold text-neutral-900">{row.countryName}</p>
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">
                    {operatorCountsByIso === null ? (
                      <span className="text-neutral-400">Loading…</span>
                    ) : (
                      <>{operatorCountsByIso[row.countryCode.trim().toUpperCase()] ?? 0} operators available</>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4 w-full rounded-md bg-neutral-50 font-semibold text-neutral-800 hover:border-blue-600 hover:bg-blue-600 hover:text-white"
                    onClick={() => goRechargeWithCountry(row.countryCode)}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {content.countriesGrid?.ctaLabel ?? 'Recharge Now'}
                      <ArrowRight className="size-4" />
                    </span>
                  </Button>
                </div>
              ))}
          </div>
        </div>
      </section>

      <LandingFaqAccordion
        title={content.faq?.title ?? 'FAQ'}
        subtitle={content.faq?.subtitle ?? ''}
        items={content.faq?.items ?? []}
      />

      <LandingAppDownloadSection promo={content.appPromo} />
    </div>
  )
}
