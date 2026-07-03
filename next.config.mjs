/** @type {import('next').NextConfig} */
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
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://checkout.razorpay.com; style-src 'self' 'unsafe-inline' https://www.gstatic.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src https://www.google.com https://www.recaptcha.net https://api.razorpay.com https://checkout.razorpay.com; base-uri 'self'; form-action 'self' https://api.razorpay.com",
  },
]

const nextConfig = {
  // Razorpay uses axios + native Node HTTPS; bundling it breaks outbound API calls in dev/prod.
  serverExternalPackages: ['razorpay'],
  poweredByHeader: false,
  allowedDevOrigins: ['194.164.150.223'],
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
