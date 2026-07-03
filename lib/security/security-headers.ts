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
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://checkout.razorpay.com; style-src 'self' 'unsafe-inline' https://www.gstatic.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src https://www.google.com https://www.recaptcha.net https://api.razorpay.com https://checkout.razorpay.com; base-uri 'self'; form-action 'self' https://api.razorpay.com",
  },
] as const

export const PRODUCTION_ONLY_SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
] as const
