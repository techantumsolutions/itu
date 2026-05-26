import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
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
        {children}
        <Toaster position="top-center" richColors />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
