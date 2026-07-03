// Media (ad images/videos) are served from Supabase Storage. In local dev this
// is an http://127.0.0.1 origin which the "https:" source does not cover, so it
// must be whitelisted explicitly or the browser blocks the asset (blank media).
function supabaseOrigin(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  try {
    return url ? new URL(url).origin : ''
  } catch {
    return ''
  }
}

const SUPABASE_ORIGIN = supabaseOrigin()
const MEDIA_SOURCES = ["'self'", 'data:', 'blob:', 'https:', SUPABASE_ORIGIN]
  .filter(Boolean)
  .join(' ')

/** Security headers applied to all app responses via next.config.mjs */
export const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://www.gstatic.com",
      `img-src ${MEDIA_SOURCES}`,
      `media-src ${MEDIA_SOURCES}`,
      "font-src 'self' data:",
      `connect-src 'self' https: wss:${SUPABASE_ORIGIN ? ` ${SUPABASE_ORIGIN}` : ''}`,
      'frame-src https://www.google.com https://www.recaptcha.net https://api.razorpay.com https://checkout.razorpay.com',
      "base-uri 'self'",
      "form-action 'self' https://api.razorpay.com",
    ].join('; '),
  },
] as const

export const PRODUCTION_ONLY_SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
] as const
