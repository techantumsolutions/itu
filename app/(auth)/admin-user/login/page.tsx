'use client'

import { useEffect, useState, useRef } from 'react'
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
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
const DEV_DEFAULT_EMAIL = 'admin@itu.com'
const isDev = process.env.NODE_ENV === 'development'
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA' // Dummy key for dev

export default function AdminUserLoginPage() {
  const router = useRouter()
  const { login, isLoading, setSession } = useAuthStore()
  const fingerprint = useFingerprint()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [devHint, setDevHint] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<TurnstileInstance | null>(null)

  // Forgot password States
  const [authView, setAuthView] = useState<'login' | 'forgot' | 'forgot-success'>('login')
  const [forgotEmail, setForgotEmail] = useState('')
  const [sendingReset, setSendingReset] = useState(false)

  // 2FA States
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [verifying2FA, setVerifying2FA] = useState(false)
  const [devOtp, setDevOtp] = useState<string | null>(null)

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

  // Reset Turnstile token when email or password is empty
  useEffect(() => {
    if (!email.trim() || !password) {
      setTurnstileToken('')
    }
  }, [email, password])



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // if (!turnstileToken && process.env.NODE_ENV === 'production') {
    //   setError('Please complete the CAPTCHA')
    //   return
    // }

    const result = await login(email.trim(), password, fingerprint || undefined, turnstileToken, 'admin-user')

    if (result.ok && result.requires_2fa) {
      setRequires2FA(true)
      setTempToken(result.temp_token || null)
      if (result.otp) {
        setDevOtp(result.otp)
      }
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
    // Login failed! Clear captcha token and reset widget
    setTurnstileToken('')
    turnstileRef.current?.reset()

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
            {authView === 'forgot-success' ? (
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600 ring-4 ring-green-50">
                <span className="text-2xl font-bold">✓</span>
              </div>
            ) : (
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-neutral-900 text-amber-400 shadow-inner">
                {requires2FA ? <QrCode className="size-7" /> : <Shield className="size-7" aria-hidden />}
              </div>
            )}
            <CardTitle className="text-xl font-bold text-neutral-900">
              {authView === 'forgot'
                ? 'Reset staff password'
                : authView === 'forgot-success'
                  ? 'Check your email'
                  : requires2FA
                    ? 'Two-Factor Authentication'
                    : 'Staff sign in'}
            </CardTitle>
            <p className="text-sm text-neutral-500">
              {authView === 'forgot'
                ? 'Enter your work email to receive a password reset link.'
                : authView === 'forgot-success'
                  ? 'We have sent a secure link to reset your staff password.'
                  : requires2FA
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

            {authView === 'forgot' ? (
              <form className="space-y-4" onSubmit={async (e) => {
                e.preventDefault()
                setError('')
                setSendingReset(true)
                try {
                  const res = await fetch('/api/auth/admin-reset-password/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
                  })
                  const data = await res.json().catch(() => ({}))
                  if (!res.ok || !data.ok) {
                    throw new Error(data.error || 'Failed to send reset link.')
                  }
                  setAuthView('forgot-success')
                } catch (err: any) {
                  setError(err?.message || 'Failed to send reset link.')
                } finally {
                  setSendingReset(false)
                }
              }}>
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Work email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="h-11 rounded-xl"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
                  disabled={sendingReset || !forgotEmail.trim().includes('@')}
                >
                  {sendingReset ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Link…
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full rounded-xl text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
                  onClick={() => {
                    setAuthView('login')
                    setError('')
                  }}
                >
                  Back to Login
                </Button>
              </form>
            ) : authView === 'forgot-success' ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-neutral-600">
                  Please check your inbox at <strong>{forgotEmail}</strong> and click the link we sent to reset your password.
                </p>
                <Button
                  className="h-11 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
                  onClick={() => {
                    setAuthView('login')
                    setError('')
                    setForgotEmail('')
                  }}
                >
                  Back to Login
                </Button>
              </div>
            ) : !requires2FA ? (
              <form className="space-y-4 mt-0" onSubmit={handleSubmit}>
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
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setError('')
                        setForgotEmail(email)
                        setPassword('')
                        setAuthView('forgot')
                      }}
                      className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                {/* <div className="flex justify-center py-2 min-h-[75px] items-center">
                  <div className={email.trim() && password ? '' : 'hidden'}>
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={(token) => setTurnstileToken(token)}
                    />
                  </div>
                  {!(email.trim() && password) && (
                    <p className="text-xs text-neutral-400 italic">
                      Please enter your email and password to verify CAPTCHA
                    </p>
                  )}
                </div> */}

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
                {devOtp && (
                  <div className="rounded-lg bg-amber-50 p-2.5 text-center text-xs font-semibold text-amber-800 border border-amber-200">
                    [Development Mode] Your OTP is: <strong className="text-sm font-bold text-amber-900">{devOtp}</strong>
                  </div>
                )}

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
                {/* <p className="text-center text-sm text-neutral-500">
                  <Link href="/login" className="font-semibold text-[var(--hero-cta-orange)] hover:underline">
                    Customer login (mobile / OTP)
                  </Link>
                </p> */}

                {/* {isDev ? (
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
                ) : null} */}
              </>
            )}
          </CardContent>
        </Card>


      </div>
    </div>
  )
}
