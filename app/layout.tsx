import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { SentryClientInit } from '@/components/observability/sentry-client-init'
import './globals.css'

const aeonik = localFont({
  variable: '--font-app',
  display: 'swap',
  src: [
    { path: './fonts/aeonik/Aeonik-Light.ttf', weight: '300', style: 'normal' },
    { path: './fonts/aeonik/Aeonik-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/aeonik/Aeonik-Bold.ttf', weight: '700', style: 'normal' },
    { path: './fonts/aeonik/Aeonik-Black.ttf', weight: '900', style: 'normal' },
  ],
})

export const metadata: Metadata = {
  title: 'ITU - International Mobile Top-Up Platform',
  description: 'Send mobile recharges instantly to 150+ countries with the best rates',
  generator: 'v0.app',
  icons: {
    icon: '/itu-logo.png',
    apple: '/itu-logo.png',
  },
}

// Avoid year-long Full Route Cache (s-maxage=31536000) on documents. Stale HTML
// after image deploys points at deleted /_next/static chunk hashes and surfaces
// as a brief successful paint followed by "couldn't load" until hard refresh.
export const revalidate = 0

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={aeonik.variable}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-background">
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            function setCookie(ip) {
              document.cookie = "client-real-ip=" + ip + "; path=/; max-age=86400; SameSite=Lax";
            }
            fetch('https://api64.ipify.org?format=json')
              .then(function(r) { return r.json(); })
              .then(function(d) { if (d && d.ip) setCookie(d.ip); })
              .catch(function() {
                fetch('https://api.ipify.org?format=json')
                  .then(function(r) { return r.json(); })
                  .then(function(d) { if (d && d.ip) setCookie(d.ip); })
                  .catch(function() {});
              });
          })();
        ` }} />
        {children}
        <SentryClientInit />
        <Toaster position="top-center" richColors />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
