/** @type {import('next').NextConfig} */

// Media (ad images/videos) are served from Supabase Storage. In local dev this
// is an http://127.0.0.1 origin which is not covered by the "https:" source, so
// it must be whitelisted explicitly or the browser blocks the asset (blank media).
function supabaseOrigin() {
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

const SECURITY_HEADERS = [
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
      `connect-src 'self' http: https: ws: wss:${SUPABASE_ORIGIN ? ` ${SUPABASE_ORIGIN}` : ''}`,
      'frame-src https://www.google.com https://www.recaptcha.net https://api.razorpay.com https://checkout.razorpay.com',
      "base-uri 'self'",
      "form-action 'self' https://api.razorpay.com",
    ].join('; '),
  },
]

const nextConfig = {
  // Razorpay uses axios + native Node HTTPS; bundling it breaks outbound API calls in dev/prod.
  serverExternalPackages: ['razorpay'],
  poweredByHeader: false,
  // Next 16 blocks cross-origin HMR/dev assets unless the host is listed.
  // Include LAN IPs so phones/other PCs can open http://192.168.x.x:3000 in development.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.1.13',
    '194.164.150.223',
    ...(process.env.ALLOWED_DEV_ORIGINS
      ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : []),
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    const headers = [...SECURITY_HEADERS]
    if (process.env.NODE_ENV === 'production') {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      })
    }
    return [{ source: '/:path*', headers }]
  },
}

export default nextConfig
