'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff, Loader2, Shield, QrCode } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/lib/stores'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'
import { useFingerprint } from '@/hooks/use-fingerprint'
import { Turnstile } from '@marsidev/react-turnstile'
const DEV_DEFAULT_EMAIL = 'admin@itu.com'
const isDev = process.env.NODE_ENV === 'development'
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA' // Dummy key for dev

export default function AdminUserLoginPage() {
  const router = useRouter()
  const { login, isLoading, setSession } = useAuthStore()
  const fingerprint = useFingerprint()

  const [email, setEmail] = useState(isDev ? DEV_DEFAULT_EMAIL : '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [devHint, setDevHint] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  
  const [turnstileToken, setTurnstileToken] = useState('')

  // 2FA States
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [verifying2FA, setVerifying2FA] = useState(false)

  useEffect(() => {
    const p = useAuthStore.persist
    const redirectIfStaff = () => {
      const u = useAuthStore.getState().user
      if (u && isClientAdminUser(u)) router.replace('/admin')
    }
    if (p?.hasHydrated?.()) redirectIfStaff()
    return p?.onFinishHydration?.(() => {
      redirectIfStaff()
    })
  }, [router])



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!turnstileToken && process.env.NODE_ENV === 'production') {
       setError('Please complete the CAPTCHA')
       return
    }

    const result = await login(email.trim(), password, fingerprint || undefined, turnstileToken, 'admin-user')
    
    if (result.ok && result.requires_2fa) {
      setRequires2FA(true)
      setTempToken(result.temp_token || null)
      return
    }

    if (result.ok) {
      const u = useAuthStore.getState().user
      if (isClientAdminUser(u)) {
        router.push('/admin')
        return
      }
      setError('This account is not authorized for the admin console. Use the customer login instead.')
      useAuthStore.getState().logout()
      return
    }
    setError(
      result.error ??
        'Invalid email or password. If this is a new project, run: npm run bootstrap:admin (requires Supabase keys in .env).',
    )
  }

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setVerifying2FA(true)

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, code: totpCode })
      })
      const data = await res.json()
      if (data.ok) {
         setSession(data.user)
         router.push('/admin')
      } else {
         setError(data.error || 'Invalid 2FA code')
      }
    } catch (err) {
      setError('Failed to verify 2FA')
    } finally {
      setVerifying2FA(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50 px-4 py-12 md:py-20">
      <div className="mx-auto w-full max-w-md">
        <Card className="overflow-hidden rounded-2xl border-neutral-200 shadow-lg">
          <CardHeader className="space-y-3 border-b border-neutral-100 bg-white pb-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-neutral-900 text-amber-400 shadow-inner">
               {requires2FA ? <QrCode className="size-7" /> : <Shield className="size-7" aria-hidden />}
            </div>
            <CardTitle className="text-xl font-bold text-neutral-900">
               {requires2FA ? 'Two-Factor Authentication' : 'Staff sign in'}
            </CardTitle>
            <p className="text-sm text-neutral-500">
              {requires2FA 
                ? 'We have sent a 6-digit authentication code to your email.'
                : 'Super admins and admins use email and password.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-5 bg-white px-6 py-8">
            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
                {error}
              </div>
            ) : null}

            {!requires2FA ? (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Work email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="h-11 rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 rounded-xl pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-center py-2">
                  <Turnstile 
                    siteKey={TURNSTILE_SITE_KEY} 
                    onSuccess={(token) => setTurnstileToken(token)}
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
                  disabled={isLoading || !email.trim() || !password || !fingerprint}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    'Sign in to admin'
                  )}
                </Button>
              </form>
            ) : (
              <form className="space-y-6" onSubmit={handleVerify2FA}>


                 <div className="space-y-2">
                    <Label htmlFor="totp-code">Authentication Code</Label>
                    <Input
                      id="totp-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="000000"
                      className="h-11 rounded-xl text-center text-lg tracking-widest"
                      maxLength={6}
                      required
                    />
                 </div>

                 <Button
                    type="submit"
                    className="h-11 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
                    disabled={verifying2FA || totpCode.length < 6}
                  >
                    {verifying2FA ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      'Verify & Continue'
                    )}
                 </Button>
              </form>
            )}

            {!requires2FA && (
              <>
                <p className="text-center text-sm text-neutral-500">
                  <Link href="/login" className="font-semibold text-[var(--hero-cta-orange)] hover:underline">
                    Customer login (mobile / OTP)
                  </Link>
                </p>

                {isDev ? (
                  <div className="space-y-2 rounded-xl border border-dashed border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
                    <p className="font-medium">Local dev</p>
                    <p>
                      Use the same port as <code className="rounded bg-white/80 px-1">npm run dev</code> (often{' '}
                      <strong>3001</strong> if 3000 is busy). Default password after reset:{' '}
                      <strong>1234567890</strong>
                    </p>
                    {devHint ? <p className="text-green-800">{devHint}</p> : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-amber-300 bg-white text-xs"
                      disabled={resetting}
                      onClick={async () => {
                        setResetting(true)
                        setDevHint(null)
                        setError('')
                        try {
                          const res = await fetch('/api/auth/dev-bootstrap-admin', { method: 'POST' })
                          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string }
                          if (!res.ok || !data.ok) throw new Error(data.error ?? 'Reset failed')
                          setDevHint(data.message ?? 'Super admin reset. Sign in with admin@itu.com / 1234567890')
                          setEmail(DEV_DEFAULT_EMAIL)
                          setPassword('1234567890')
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Could not reset dev admin')
                        } finally {
                          setResetting(false)
                        }
                      }}
                    >
                      {resetting ? 'Resetting…' : 'Reset dev super-admin password'}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-xs text-neutral-400">
          <span className="inline-flex items-center gap-2">
            <Image src="/auth/icon-secure.png" alt="" width={20} height={20} className="opacity-70" />
            {requires2FA ? 'Secured by Two-Factor Authentication' : 'Session cookies are set for secure admin access.'}
          </span>
        </p>
      </div>
    </div>
  )
}
