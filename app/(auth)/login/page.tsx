'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/lib/stores'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'
import { useCMSStore } from '@/lib/cms-store'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { readLocaleCookiesFromDocument } from '@/lib/locale/locale-cookies'

export default function LoginPage() {
  const router = useRouter()
  const { login, setSession, isLoading } = useAuthStore()
  const { content, hasHydrated } = useCMSStore()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const [otpStep, setOtpStep] = useState<'entry' | 'otp'>('entry')
  const [otpValue, setOtpValue] = useState('')
  const [otpTimer, setOtpTimer] = useState(25)
  const [sendingOtp, setSendingOtp] = useState(false)

  const isEmail = useMemo(() => identifier.includes('@'), [identifier])
  const normalizedPhone = useMemo(() => identifier.replace(/[^\d]/g, ''), [identifier])
  const maskedPhone = useMemo(() => {
    const p = normalizedPhone
    if (p.length < 4) return p
    return `${p.slice(0, 2)}${'x'.repeat(Math.max(0, p.length - 4))}${p.slice(-2)}`
  }, [normalizedPhone])

  useEffect(() => {
    if (otpStep !== 'otp') return
    if (otpTimer <= 0) return
    const t = setInterval(() => setOtpTimer((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [otpStep, otpTimer])

  const handleEmailLogin = async () => {
    setError('')
    const result = await login(identifier, password)
    if (result.ok) {
      const u = useAuthStore.getState().user
      if (isClientAdminUser(u)) router.push('/admin')
      else router.push('/account')
    } else {
      setError(result.error ?? 'Invalid email or password.')
    }
  }

  return (
    <div className="bg-white px-4 py-10 md:py-16">
      <div className="mx-auto grid w-full max-w-5xl items-stretch gap-10 lg:grid-cols-2 lg:max-h-[700px]">
        <div className="flex justify-center lg:justify-start">
          <div className="flex w-full max-w-md flex-col">
            <div className="relative flex-1 overflow-hidden rounded-3xl bg-[#f6c84c] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.45)]">
              <Image
                src={(hasHydrated && content.authPages.leftImage) || '/auth/auth-hero.png'}
                alt=""
                fill
                className="object-cover"
                priority
                unoptimized={(hasHydrated ? content.authPages.leftImage : '').startsWith('data:')}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/15 to-transparent" />
            </div>
          </div>
        </div>

        <Card className="w-full overflow-hidden rounded-2xl border-neutral-200 shadow-[0_22px_70px_-44px_rgba(15,23,42,0.35)]">
          <CardHeader className="space-y-2 text-center">
            {otpStep === 'entry' ? (
              <>
                <div className="mx-auto mt-2">
                  <Image src="/auth/icon-secure.png" alt="" width={70} height={70} className="mx-auto h-auto w-[70px]" />
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Login with Mobile /Email</CardTitle>
                <p className="text-sm text-neutral-500">Enter your mobile number to continue</p>
              </>
            ) : (
              <>
                <div className="mx-auto mt-2">
                  <Image src="/auth/otp-icon.png" alt="" width={66} height={66} className="mx-auto h-auto w-[66px]" />
                </div>
                <CardTitle className="text-base font-bold text-neutral-900 md:text-lg">Verify your mobile number</CardTitle>
                <div className="space-y-0.5 text-xs text-neutral-500 md:text-sm">
                  <p>We just sent 6-digit code to</p>
                  <p className="font-semibold text-neutral-700">+91 {maskedPhone}</p>
                </div>
              </>
            )}
          </CardHeader>

          <CardContent className="max-h-[700px] overflow-y-auto px-6 pb-8 pt-2 md:px-8">
            {error ? <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}

            {otpStep === 'entry' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-neutral-700">Login with Mobile/ Email</p>
                  <Input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="+91 9949820346 or name@example.com"
                    className="h-12 rounded-xl"
                    autoComplete="username"
                  />
                </div>

                {isEmail ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-neutral-700">Password</p>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="h-12 rounded-xl pr-10"
                        autoComplete="current-password"
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
                ) : null}

                <Button
                  className="h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                  disabled={isLoading || sendingOtp || !identifier.trim() || (!isEmail && normalizedPhone.length < 10) || (isEmail && !password)}
                  onClick={async () => {
                    setError('')
                    if (isEmail) {
                      await handleEmailLogin()
                      return
                    }
                    setSendingOtp(true)
                    try {
                      const res = await fetch('/api/auth/otp/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: `+91${normalizedPhone}` }),
                      })
                      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
                      if (!res.ok || !data.ok) throw new Error(data.error || 'otp_send_failed')
                      setOtpValue('')
                      setOtpTimer(25)
                      setOtpStep('otp')
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to send OTP.')
                    } finally {
                      setSendingOtp(false)
                    }
                  }}
                >
                  {isLoading || sendingOtp ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isEmail ? 'Logging in…' : 'Sending OTP…'}
                    </>
                  ) : (
                    'Login'
                  )}
                </Button>

                <div className="pt-2 text-center text-xs text-neutral-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex size-4 items-center justify-center rounded-full bg-neutral-100 text-[10px] text-neutral-600 ring-1 ring-black/5">
                      ✓
                    </span>
                    Your data is secure &amp; encrypted
                  </span>
                </div>

                <p className="text-center text-sm text-neutral-500">
                  Don&apos;t have an Account?{' '}
                  <Link href="/register" className="font-semibold text-[var(--hero-cta-orange)] hover:underline">
                    Sign up here
                  </Link>
                </p>
                <p className="text-center text-sm text-neutral-500">
                  Staff (super admin / admin)?{' '}
                  <Link href="/admin/login" className="font-semibold text-neutral-800 underline-offset-4 hover:underline">
                    Admin sign in
                  </Link>
                </p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-sm space-y-5 pb-2">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otpValue} onChange={setOtpValue} containerClassName="justify-center gap-2">
                    <InputOTPGroup className="gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-10 w-10 rounded-lg border border-neutral-200 bg-neutral-50 text-base shadow-[0_1px_0_rgba(15,23,42,0.03)]"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <div className="text-center text-[11px] text-neutral-500">
                  {otpTimer > 0 ? (
                    <>
                      Resend code in <span className="font-semibold text-[var(--hero-cta-orange)]">00:{String(otpTimer).padStart(2, '0')}</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="font-semibold text-[var(--hero-cta-orange)] hover:underline"
                      onClick={async () => {
                        setOtpTimer(25)
                        setOtpValue('')
                      }}
                    >
                      Resend code
                    </button>
                  )}
                </div>

                <Button
                  className="h-11 w-full rounded-xl bg-[var(--hero-cta-orange)] text-sm font-semibold text-white hover:brightness-105"
                  disabled={isLoading || otpValue.length !== 6}
                  onClick={async () => {
                    setError('')
                    try {
                      const res = await fetch('/api/auth/otp/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: `+91${normalizedPhone}`, otp: otpValue }),
                      })
                      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
                      if (!res.ok || !data.ok) throw new Error(data.error || 'otp_verify_failed')

                      const me = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
                      const meData = (await me.json().catch(() => ({}))) as { user?: any }
                      if (meData?.user?.id) {
                        setSession(meData.user)
                        const c = readLocaleCookiesFromDocument()
                        void fetch('/api/profile/locale', {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            userId: meData.user.id,
                            country: c.country ?? 'IN',
                            language: c.language ?? 'en-IN',
                            currency: c.currency ?? 'INR',
                          }),
                        }).catch(() => {})
                      }
                      const u = meData?.user
                      if (isClientAdminUser(u)) router.push('/admin')
                      else router.push('/account')
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'OTP verification failed.')
                    }
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    'Verify OTP'
                  )}
                </Button>

                <Button
                  variant="ghost"
                  className="h-10 w-full rounded-xl text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
                  onClick={() => {
                    setOtpStep('entry')
                    setOtpValue('')
                    setError('')
                  }}
                >
                  Change number / email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
