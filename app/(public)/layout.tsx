'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Menu,
  User,
  LogOut,
  History,
  Settings,
  Gift,
  ChevronDown,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuthStore, useLocalePreferencesStore } from '@/lib/stores'
import { useCMSStore } from '@/lib/cms-store'
import type { Country } from '@/lib/types'
import { NAV_CURRENCIES, navRegionShortLabel, isNavCurrency } from '@/lib/locale-nav-data'
import { readLocaleCookiesFromDocument, setLocaleCookiesClient } from '@/lib/locale/locale-cookies'
import { normalizeCountryCode } from '@/lib/locale/country-config'
import { cn } from '@/lib/utils'
import { ItuLogoMark } from '@/components/itu-logo-mark'
import { FooterPaymentLogos } from '@/components/footer-payment-logos'
import { TargetedAdBanner } from '@/components/targeted-ad-banner'
import { CMSTypographyScope } from '@/components/cms-typography-scope'
import { AdManager } from '@/components/ui/ads/ad-manager'
import { SessionIdleGuard } from '@/components/session-idle-guard'

const navLinks = [
  { href: '/', label: 'Home', match: (p: string) => p === '/' },
  { href: '/topup', label: 'Top-up', match: (p: string) => p.startsWith('/topup') },
  { href: '/help', label: 'Help', match: (p: string) => p.startsWith('/help') },
]

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, logout } = useAuthStore()
  const { content, setContent, hasHydrated } = useCMSStore()
  const {
    regionCode,
    languageCode,
    currencyCode,
    manualOverride,
    setRegion,
    setLanguage,
    setCurrency,
    setManualOverride,
  } = useLocalePreferencesStore()
  const [countries, setCountries] = useState<Country[]>([])

  const region =
    countries.find((c) => c.code === regionCode) ??
    countries[0] ??
    ({ code: regionCode || '', name: regionCode || 'Region', flag: '', dialCode: '', dialingInfo: [] } as Country)
  const language =
    content.header.languages.find((l) => l.code === languageCode) ?? content.header.languages[0]!
  const currency = NAV_CURRENCIES.find((c) => c.code === currencyCode) ?? NAV_CURRENCIES[0]!

  const handleSignOut = () => {
    logout()
    router.push('/')
  }

  useEffect(() => {
    document.documentElement.lang = languageCode
  }, [languageCode])

  useEffect(() => {
    // Load CMS content from server so all browsers see the same content.
    // Important: wait for zustand-persist hydration first so localStorage doesn't overwrite DB content after we set it.
    if (!hasHydrated) return

    // If CMS fetch fails temporarily (network/restart), keep showing the last known good content.
    try {
      const raw = window.localStorage.getItem('itu-cms-last-good')
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object') {
          setContent(parsed as any, { markDirty: false })
        }
      }
    } catch {
      // ignore
    }

    let cancelled = false
    void fetch('/api/cms', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('cms'))))
      .then((data: { content?: unknown; ok?: boolean }) => {
        if (cancelled) return
        if (data?.content && typeof data.content === 'object') {
          setContent(data.content as any, { markDirty: false })
          try {
            window.localStorage.setItem('itu-cms-last-good', JSON.stringify(data.content))
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // ignore: keep local persisted/default CMS
      })
    return () => {
      cancelled = true
    }
  }, [hasHydrated, setContent])

  useEffect(() => {
    // Hydrate from middleware-set cookies (no Geo fetch on every page view).
    // Never override if user has manually selected preferences.
    if (manualOverride) return
    const cookies = readLocaleCookiesFromDocument()
    if (cookies.manual) {
      setManualOverride(true)
      return
    }

    const cc = normalizeCountryCode(cookies.country) ?? null
    const lang = (cookies.language ?? '').trim()
    const cur = (cookies.currency ?? '').trim().toUpperCase()

    const apply = (opts: { countryCode?: string | null; languageCode?: string | null; currencyCode?: string | null }) => {
      const ccc = normalizeCountryCode(opts.countryCode ?? null)
      const ll = (opts.languageCode ?? '').trim()
      const cu = (opts.currencyCode ?? '').trim().toUpperCase()

      if (ccc && countries.some((c) => c.code === ccc) && regionCode === 'IN') setRegion(ccc)
      if (ll && languageCode === 'en') {
        // CMS stores base language codes (e.g. "en"), while detection may return "en-IN"
        const base = ll.split('-')[0]!.toLowerCase()
        if (content.header.languages.some((l) => l.code.toLowerCase() === base)) setLanguage(base)
      }
      if (cu && isNavCurrency(cu) && currencyCode === 'USD') setCurrency(cu)
    }

    // If cookies already exist, apply immediately (no flicker).
    if (cc || lang || cur) {
      apply({ countryCode: cc, languageCode: lang, currencyCode: cur })
      return
    }

    // Fallback: if middleware didn’t set cookies (local dev / some hosts),
    // fetch a derived value once from the server and persist it.
    const run = async () => {
      try {
        const res = await fetch('/api/geo', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as {
          countryCode: string | null
          languageCode: string | null
          currencyCode: string | null
          manualOverride?: boolean
        }
        if (data.manualOverride) {
          setManualOverride(true)
          return
        }
        apply(data)
        setLocaleCookiesClient({
          country: data.countryCode ?? undefined,
          language: data.languageCode ?? undefined,
          currency: data.currencyCode ?? undefined,
          manual: false,
        })
      } catch {
        // ignore
      }
    }
    void run()
  }, [
    countries,
    content.header.languages,
    currencyCode,
    languageCode,
    manualOverride,
    regionCode,
    setCurrency,
    setLanguage,
    setManualOverride,
    setRegion,
  ])

  useEffect(() => {
    void fetch('/api/countries', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setCountries(Array.isArray(data?.countries) ? data.countries : []))
      .catch(() => setCountries([]))
  }, [])

  useEffect(() => {
    if (countries.length > 0 && !regionCode) {
      setRegion(countries[0]!.code)
    }
  }, [countries, regionCode, setRegion])

  useEffect(() => {
    if (!languageCode && content.header.languages[0]) {
      setLanguage(content.header.languages[0].code)
    }
  }, [languageCode, content.header.languages, setLanguage])

  useEffect(() => {
    if (!currencyCode) {
      setCurrency('USD')
    }
  }, [currencyCode, setCurrency])

  const isHome = pathname === '/'
  const [navScrolled, setNavScrolled] = useState(false)

  useEffect(() => {
    if (!isHome) {
      setNavScrolled(false)
      return
    }
    const onScroll = () => setNavScrolled(window.scrollY > 28)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHome])

  const onHeroTop = isHome && !navScrolled
  const navBarSolid = !isHome || navScrolled

  const navClass = (active: boolean) =>
    cn(
      'rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors md:px-3.5',
      onHeroTop
        ? active
          ? 'text-[var(--hero-cta-orange)]'
          : 'text-white/95 hover:bg-white/10'
        : active
          ? 'text-neutral-900'
          : 'text-neutral-500 hover:bg-neutral-100/90 hover:text-neutral-800',
    )

  const headerChromeBtn = onHeroTop
    ? 'text-white hover:bg-white/10 border-transparent'
    : 'text-neutral-600 hover:bg-neutral-100/90 hover:text-neutral-900'

  const footerBgImage = (content.footer.backgroundImage ?? '').trim()
  const footerMainBg = (content.footer.mainBackgroundColor ?? '#e4e4e4').trim()
  const footerSubBg = (content.footer.subFooterBackgroundColor ?? '#d0d0d0').trim()
  const footerCopyrightLine = (content.footer.copyrightTemplate ?? '© {{brand}} {{year}}. All rights reserved.')
    .replace(/\{\{year\}\}/gi, String(new Date().getFullYear()))
    .replace(/\{\{brand\}\}/gi, content.header.logoText)
  const footerSocialClass =
    'flex size-10 items-center justify-center rounded-full bg-[#0b1f35] text-white shadow-sm transition-colors hover:bg-[#132a45] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/25'

  return (
    <CMSTypographyScope className="min-h-screen flex flex-col bg-background">
      <SessionIdleGuard variant="public" />
      <header
        className={cn(
          'pointer-events-none fixed inset-x-0 z-50 flex justify-center transition-[padding] duration-200 max-w-6xl mx-auto',
          onHeroTop ? 'top-0 pt-1 sm:pt-2' : 'top-1',
        )}
      >
        <div
          className={cn(
            'pointer-events-auto flex w-full max-w-7xl items-center gap-2 py-2 pl-2 pr-2 transition-[background-color,box-shadow,border-color,border-radius] duration-200 sm:gap-3 sm:pl-4 md:py-1 md:pl-6',
            navBarSolid
              ? 'rounded-full border border-neutral-200/90 bg-white/95 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl'
              : 'border-transparent bg-transparent',
          )}
        >
          <Link href="/" className="flex shrink-0 items-center gap-2 pl-1" aria-label={content.header.logoText}>
            <ItuLogoMark />
          </Link>

          <nav className="mx-auto hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex">
            {navLinks.map((item) => {
              const active = item.match(pathname)
              return (
                <Link key={item.href} href={item.href} className={navClass(active)}>
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('hidden h-9 gap-1.5 rounded-full px-2.5 md:inline-flex', headerChromeBtn)}
                  aria-label={`Region: ${region.name}`}
                >
                  <span className="text-base leading-none">{region.flag}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide">
                    {navRegionShortLabel(region.code)}
                  </span>
                  <ChevronDown className="size-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[min(24rem,70vh)] w-56 overflow-y-auto rounded-2xl p-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
                {countries.length === 0 ? (
                  <DropdownMenuItem disabled className="rounded-xl text-muted-foreground">
                    No regions configured
                  </DropdownMenuItem>
                ) : null}
                {countries.map((c) => (
                  <DropdownMenuItem
                    key={c.code}
                    className={cn('rounded-xl', c.code === region.code && 'bg-muted font-medium')}
                    onClick={() => {
                      setRegion(c.code)
                      setManualOverride(true)
                      setLocaleCookiesClient({ country: c.code, manual: true })
                    }}
                  >
                    <span className="mr-2 text-base leading-none">{c.flag}</span>
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{navRegionShortLabel(c.code)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {content.header.showLanguageSelector && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('hidden h-9 gap-1.5 rounded-full px-2.5 sm:inline-flex', headerChromeBtn)}
                    aria-label={`Language: ${language.name}`}
                  >
                    <span className="text-base leading-none">{language.flag}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide">
                      {language.code.toUpperCase()}
                    </span>
                    <ChevronDown className="size-3.5 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
                  {content.header.languages.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      className={cn('rounded-xl', lang.code === language.code && 'bg-muted font-medium')}
                      onClick={() => {
                        setLanguage(lang.code)
                        setManualOverride(true)
                        setLocaleCookiesClient({ language: lang.code, manual: true })
                      }}
                    >
                      <span className="mr-2">{lang.flag}</span>
                      {lang.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('hidden h-9 gap-1.5 rounded-full px-2.5 md:inline-flex', headerChromeBtn)}
                  aria-label={`Currency: ${currency.name}`}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide">
                    {currency.code === 'USD' ? '$ USD' : currency.code}
                  </span>
                  <ChevronDown className="size-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
                {NAV_CURRENCIES.map((cur) => (
                  <DropdownMenuItem
                    key={cur.code}
                    className={cn('rounded-xl', cur.code === currency.code && 'bg-muted font-medium')}
                    onClick={() => {
                      setCurrency(cur.code)
                      setManualOverride(true)
                      setLocaleCookiesClient({ currency: cur.code, manual: true })
                    }}
                  >
                    <span className="font-mono text-xs font-semibold">{cur.code}</span>
                    <span className="ml-2 text-muted-foreground">{cur.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-9 gap-2 rounded-full px-2',
                      onHeroTop ? 'text-white hover:bg-white/10' : 'text-neutral-700 hover:bg-neutral-100/90',
                    )}
                  >
                    <Avatar className={cn('size-8', onHeroTop ? 'ring-1 ring-white/40' : 'ring-1 ring-neutral-200')}>
                      {user.avatar && (
                        <AvatarImage src={user.avatar} alt={user.name} className="object-cover" />
                      )}
                      <AvatarFallback
                        className={cn(
                          'text-xs font-bold',
                          onHeroTop ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-800',
                        )}
                      >
                        {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="hidden size-3.5 opacity-50 sm:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold">{user.name || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="rounded-xl">
                    <Link href="/account" className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      My Account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl">
                    <Link href="/account/transactions" className="flex items-center">
                      <History className="mr-2 h-4 w-4" />
                      Transaction History
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl">
                    <Link href="/account/rewards" className="flex items-center">
                      <Gift className="mr-2 h-4 w-4" />
                      Rewards ({user.rewardPoints || 0} pts)
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl">
                    <Link href="/account/settings" className="flex items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="rounded-xl text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                size="sm"
                className={cn(
                  'h-9 shrink-0 px-6 text-[11px] font-bold uppercase tracking-[0.12em]',
                  isHome
                    ? 'rounded-lg border-0 bg-[var(--hero-cta-orange)] text-white shadow-[0_10px_26px_-8px_rgba(241,90,43,0.55)] hover:bg-[var(--hero-cta-orange)]/92'
                    : 'rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_-4px_rgba(227,6,19,0.45)] hover:bg-primary/90',
                )}
                asChild
              >
                <Link href="/login">Login</Link>
              </Button>
            )}

            {/* Mobile locale selectors — visible on small screens beside menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-8 gap-1 rounded-full px-2 md:hidden', headerChromeBtn)}
                  aria-label={`${region.name} · ${currency.code}`}
                >
                  <span className="text-sm leading-none">{region.flag}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide">{currency.code}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-2xl p-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
                <div className="px-3 py-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Country</p>
                </div>
                <div className="max-h-[160px] overflow-y-auto">
                  {countries.map((c) => (
                    <DropdownMenuItem
                      key={c.code}
                      className={cn('rounded-xl text-xs', c.code === region.code && 'bg-muted font-medium')}
                      onClick={() => {
                        setRegion(c.code)
                        setManualOverride(true)
                        setLocaleCookiesClient({ country: c.code, manual: true })
                      }}
                    >
                      <span className="mr-2 text-sm">{c.flag}</span>
                      <span className="flex-1">{c.name}</span>
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <div className="px-3 py-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Currency</p>
                </div>
                {NAV_CURRENCIES.map((cur) => (
                  <DropdownMenuItem
                    key={cur.code}
                    className={cn('rounded-xl text-xs', cur.code === currency.code && 'bg-muted font-medium')}
                    onClick={() => {
                      setCurrency(cur.code)
                      setManualOverride(true)
                      setLocaleCookiesClient({ currency: cur.code, manual: true })
                    }}
                  >
                    <span className="font-mono text-xs font-semibold">{cur.code}</span>
                    <span className="ml-2 text-muted-foreground">{cur.name}</span>
                  </DropdownMenuItem>
                ))}
                {content.header.showLanguageSelector ? (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-3 py-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Language</p>
                    </div>
                    {content.header.languages.map((lang) => (
                      <DropdownMenuItem
                        key={lang.code}
                        className={cn('rounded-xl text-xs', lang.code === language.code && 'bg-muted font-medium')}
                        onClick={() => {
                          setLanguage(lang.code)
                          setManualOverride(true)
                          setLocaleCookiesClient({ language: lang.code, manual: true })
                        }}
                      >
                        <span className="mr-2">{lang.flag}</span>
                        {lang.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-9 shrink-0 rounded-full lg:hidden',
                    onHeroTop ? 'text-white hover:bg-white/10' : 'text-neutral-700 hover:bg-neutral-100/90',
                  )}
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(100%,22rem)] border-l border-neutral-200/80 bg-white/95 backdrop-blur-xl">
                <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                <nav className="mt-10 flex flex-col gap-1">
                  {navLinks.map((item) => {
                    const active = item.match(pathname)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em]',
                          active ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50',
                        )}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                  <div className="my-3 h-px bg-neutral-200" />
                  {!isAuthenticated ? (
                    <>
                      <Link
                        href="/login"
                        className="rounded-2xl bg-primary px-4 py-3 text-center text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground shadow-md"
                      >
                        Login
                      </Link>
                      <Link
                        href="/register"
                        className="rounded-2xl px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-neutral-50"
                      >
                        Create account
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link href="/account" className="rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-neutral-50">
                        My account
                      </Link>
                      <Link
                        href="/account/transactions"
                        className="rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-neutral-50"
                      >
                        Transactions
                      </Link>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="rounded-2xl px-4 py-3 text-left text-sm font-semibold text-destructive hover:bg-red-50"
                      >
                        Sign out
                      </button>
                    </>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'flex flex-1 flex-col',
          pathname === '/' ? 'pt-0' : 'pt-[5.25rem] sm:pt-[5.5rem]',
        )}
      >
        {pathname === '/' && <TargetedAdBanner />}
        <AdManager placement="global_popup" country={regionCode} />
        <AdManager placement="global_scroll" country={regionCode} />
        {pathname === '/' ? (
          children
        ) : pathname.startsWith('/account') ? (
          <div className="">
            {children}
          </div>
        ) : (
          <div className="">
            {children}
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-neutral-300/90 text-neutral-900">
        <>
          <div
            className="border-b border-neutral-400/20"
            style={
              footerBgImage
                ? {
                  backgroundImage: `linear-gradient(rgba(228, 228, 228, 0.94), rgba(228, 228, 228, 0.94)), url(${footerBgImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
                : { backgroundColor: footerMainBg }
            }
          >
            <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
              <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
                <div className="space-y-5 sm:col-span-2 lg:col-span-1">
                  <Link href="/" className="inline-flex" aria-label={`${content.header.logoText} home`}>
                    {content.footer.footerLogo ? (
                      <img src={content.footer.footerLogo} alt={content.header.logoText} className="h-10 w-auto object-contain" />
                    ) : (
                      <ItuLogoMark size="lg" />
                    )}
                  </Link>
                  <p className="max-w-sm text-sm font-normal leading-relaxed text-neutral-800">
                    {content.footer.brandTagline}
                  </p>
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <a
                      href={content.footer.socialLinks.twitter}
                      className={footerSocialClass}
                      aria-label="X (Twitter)"
                    >
                      <Twitter className="h-4 w-4" strokeWidth={2} />
                    </a>
                    <a href={content.footer.socialLinks.facebook} className={footerSocialClass} aria-label="Facebook">
                      <Facebook className="h-4 w-4" strokeWidth={2} />
                    </a>
                    <a href={content.footer.socialLinks.youtube} className={footerSocialClass} aria-label="YouTube">
                      <Youtube className="h-4 w-4" strokeWidth={2} />
                    </a>
                    <a href={content.footer.socialLinks.linkedin} className={footerSocialClass} aria-label="LinkedIn">
                      <Linkedin className="h-4 w-4" strokeWidth={2} />
                    </a>
                  </div>
                </div>

                <div>
                  <h4 className="mb-4 text-sm font-bold text-neutral-900">Company</h4>
                  <ul className="space-y-3 text-sm font-normal text-neutral-800">
                    {content.footer.companyLinks.map((link) => (
                      <li key={`${link.href}-${link.label}`}>
                        <Link
                          href={link.href}
                          className="transition-colors hover:text-neutral-950 hover:underline underline-offset-4"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="mb-4 text-sm font-bold text-neutral-900">Legal</h4>
                  <ul className="space-y-3 text-sm font-normal text-neutral-800">
                    {content.footer.legalLinks.map((link) => (
                      <li key={`${link.href}-${link.label}`}>
                        <Link
                          href={link.href}
                          className="transition-colors hover:text-neutral-950 hover:underline underline-offset-4"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 border-t border-neutral-400/30 pt-6">
                    <FooterPaymentLogos />
                  </div>
                </div>

                <div>
                  <h4 className="mb-4 text-sm font-bold text-neutral-900">Help</h4>
                  <ul className="space-y-3 text-sm font-normal text-neutral-800">
                    {content.footer.helpLinks.map((link) => (
                      <li key={`${link.href}-${link.label}`}>
                        <Link
                          href={link.href}
                          className="transition-colors hover:text-neutral-950 hover:underline underline-offset-4"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-400/25" style={{ backgroundColor: footerSubBg }}>
            <p className="py-4 text-center text-sm font-bold tracking-tight text-neutral-900 md:py-5">
              {footerCopyrightLine}
            </p>
          </div>
        </>
      </footer>
    </CMSTypographyScope>
  )
}
