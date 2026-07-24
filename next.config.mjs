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
  // Production Docker web image uses Next standalone output (Phase 3D).
  output: 'standalone',
  // Razorpay uses axios + native Node HTTPS; bundling it breaks outbound API calls in dev/prod.
  // Observability packages stay external so workers/scripts can resolve them too.
  serverExternalPackages: ['razorpay', 'prom-client', '@sentry/nextjs', 'bullmq', 'ioredis'],
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
    const security = [...SECURITY_HEADERS]
    // Only emit HSTS when the public site is actually served over HTTPS.
    // Setting HSTS on plain http://IP:4009 confuses browsers and can break
    // subsequent asset loads after the first document response.
    const hstsEnabled =
      process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'
    if (hstsEnabled) {
      security.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      })
    }

    return [
      // Hashed build artifacts — immutable (safe across deploys via new filenames).
      {
        source: '/_next/static/:path*',
        headers: [
          ...security,
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // HTML / RSC / pages — never long-cache. Stale HTML after deploy references
      // deleted Turbopack/webpack chunk hashes → "couldn't load" until hard refresh.
      {
        source: '/:path*',
        headers: [
          ...security,
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ]
  },
}

export default nextConfig
