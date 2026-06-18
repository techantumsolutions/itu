import { NextResponse, type NextRequest } from 'next/server'
import {
  FALLBACK_LOCALE,
  inferLocaleFromCountry,
  normalizeCountryCode,
  normalizeCurrencyCode,
  pickLanguageTag,
} from '@/lib/locale/country-config'
import {
  LOCALE_COOKIE_COUNTRY,
  LOCALE_COOKIE_CURRENCY,
  LOCALE_COOKIE_LANGUAGE,
  LOCALE_COOKIE_MANUAL,
} from '@/lib/locale/locale-cookies'

type IpApiResponse = {
  country_code?: string
  country?: string
  currency?: string
  languages?: string
}

/** Host runtimes may attach geo; not on the public NextRequest type. */
type RequestWithGeo = NextRequest & { geo?: { country?: string | null }; ip?: string }

function firstIpFromXForwardedFor(xff: string | null): string | null {
  if (!xff) return null
  const first = xff.split(',')[0]?.trim()
  return first || null
}

async function geoFromIpApi(ip: string): Promise<{ country: string | null; currency: string | null; language: string | null }> {
  const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return { country: null, currency: null, language: null }
  const data = (await res.json()) as IpApiResponse
  const country = normalizeCountryCode(data.country_code ?? null)
  const currency = normalizeCurrencyCode(data.currency ?? null)
  const language = ((data.languages ?? '').split(',')[0]?.trim()) || null
  return { country, currency, language }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/_next') || pathname.startsWith('/static')) {
    return NextResponse.next()
  }

  // File-like public assets (fonts, images, etc.)
  if (pathname.includes('.')) {
    return NextResponse.next()
  }

  // OAuth / Supabase-style callbacks: pass through without touching cookies.
  if (pathname.startsWith('/auth')) {
    return NextResponse.next()
  }

  const manual = request.cookies.get(LOCALE_COOKIE_MANUAL)?.value === '1'
  if (manual) return NextResponse.next()

  const existingCountry = request.cookies.get(LOCALE_COOKIE_COUNTRY)?.value
  const existingLanguage = request.cookies.get(LOCALE_COOKIE_LANGUAGE)?.value
  const existingCurrency = request.cookies.get(LOCALE_COOKIE_CURRENCY)?.value

  if (existingCountry && existingLanguage && existingCurrency) return NextResponse.next()

  const h = request.headers
  const extended = request as RequestWithGeo
  const geoCountry = normalizeCountryCode(extended.geo?.country ?? null)

  const headerCountry =
    geoCountry ||
    normalizeCountryCode(h.get('x-vercel-ip-country')) ||
    normalizeCountryCode(h.get('cf-ipcountry')) ||
    normalizeCountryCode(h.get('x-country-code')) ||
    null

  let detected = inferLocaleFromCountry(headerCountry)
  let detectedLanguageTag = pickLanguageTag(h.get('accept-language'), detected.country) ?? detected.language

  if (!headerCountry) {
    const ip = firstIpFromXForwardedFor(h.get('x-forwarded-for')) || extended.ip || null
    if (ip) {
      try {
        const fromApi = await geoFromIpApi(ip)
        const base = inferLocaleFromCountry(fromApi.country ?? null)
        detected = {
          country: fromApi.country ?? base.country ?? FALLBACK_LOCALE.country,
          currency: fromApi.currency ?? base.currency ?? FALLBACK_LOCALE.currency,
          language: base.language ?? FALLBACK_LOCALE.language,
        }
        detectedLanguageTag = fromApi.language ?? pickLanguageTag(h.get('accept-language'), detected.country) ?? detected.language
      } catch {
        // ignore and fallback
      }
    }
  }

  const res = NextResponse.next()
  res.headers.set('x-country', detected.country)
  if (!existingCountry) res.cookies.set(LOCALE_COOKIE_COUNTRY, detected.country, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  if (!existingCurrency) res.cookies.set(LOCALE_COOKIE_CURRENCY, detected.currency, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  if (!existingLanguage) res.cookies.set(LOCALE_COOKIE_LANGUAGE, detectedLanguageTag, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  return res
}

export const config = {
  matcher: [
    // api + full _next tree + favicon + common static extensions (fonts/images)
    '/((?!api|_next|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf|otf|eot)$).*)',
  ],
}
