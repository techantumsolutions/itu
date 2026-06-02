'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Check, ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/lib/stores'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'
import { useCMSStore } from '@/lib/cms-store'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { readLocaleCookiesFromDocument } from '@/lib/locale/locale-cookies'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { countriesList, getFlagEmoji, isValidPhoneNumber } from '@/lib/country-codes'

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
  const [devOtp, setDevOtp] = useState('')
  const [selectedCountryCode, setSelectedCountryCode] = useState('IN')
  const [selectedDialCode, setSelectedDialCode] = useState('91')
  const [openCountry, setOpenCountry] = useState(false)

  const [authView, setAuthView] = useState<'login' | 'forgot' | 'forgot-success'>('login')
  const [forgotEmail, setForgotEmail] = useState('')
  const [sendingReset, setSendingReset] = useState(false)

  const isEmail = useMemo(() => identifier.includes('@'), [identifier])
  const normalizedPhone = useMemo(() => identifier.replace(/[^\d]/g, ''), [identifier])
  const isValidPhone = useMemo(() => {
    if (isEmail) return false
    return isValidPhoneNumber(identifier, selectedCountryCode)
  }, [identifier, isEmail, selectedCountryCode])
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

  useEffect(() => {
    if (isEmail) {
      setForgotEmail(identifier)
    }
  }, [identifier, isEmail])

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

  const handleSendResetLink = async () => {
    setError('')
    setSendingReset(true)
    try {
      const res = await fetch('/api/auth/reset-password/send', {
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
            {authView === 'forgot' ? (
              <>
                <div className="mx-auto mt-2">
                  <Image src="/auth/icon-secure.png" alt="" width={70} height={70} className="mx-auto h-auto w-[70px]" />
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Reset Password</CardTitle>
                <p className="text-sm text-neutral-500">Enter your email to receive a password reset link.</p>
              </>
            ) : authView === 'forgot-success' ? (
              <>
                <div className="mx-auto mt-2">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600 ring-4 ring-green-50">
                    <span className="text-2xl font-bold">✓</span>
                  </div>
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Check your email</CardTitle>
                <p className="text-sm text-neutral-500">We have sent a secure link to reset your password.</p>
              </>
            ) : otpStep === 'entry' ? (
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
                  <p className="font-semibold text-neutral-700">+{selectedDialCode} {maskedPhone}</p>
                </div>
              </>
            )}
          </CardHeader>

          <CardContent className="max-h-[700px] overflow-y-auto px-6 pb-8 pt-2 md:px-8">
            {error ? <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}

            {authView === 'forgot' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-neutral-700">Email Address</p>
                  <Input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-12 rounded-xl"
                  />
                </div>

                <Button
                  className="h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                  disabled={sendingReset || !forgotEmail.trim().includes('@')}
                  onClick={handleSendResetLink}
                >
                  {sendingReset ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Link...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>

                <Button
                  variant="ghost"
                  className="h-11 w-full rounded-xl text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
                  onClick={() => {
                    setAuthView('login')
                    setError('')
                  }}
                >
                  Back to Login
                </Button>
              </div>
            ) : authView === 'forgot-success' ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-neutral-600">
                  Please check your inbox at <strong>{forgotEmail}</strong> and click the link we sent to reset your password.
                </p>
                <div className="pt-2">
                  <Button
                    className="h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                    onClick={() => {
                      setAuthView('login')
                      setError('')
                    }}
                  >
                    Back to Login
                  </Button>
                </div>
              </div>
            ) : otpStep === 'entry' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-neutral-700">Login with Mobile/ Email</p>
                  <div className="flex items-center gap-2">
                    {!isEmail && (
                      <Popover open={openCountry} onOpenChange={setOpenCountry}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCountry}
                            className="flex h-12 items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 shrink-0 min-w-[110px] justify-between shadow-none"
                          >
                            <span className="truncate">
                              {selectedCountryCode ? `${getFlagEmoji(selectedCountryCode)} +${selectedDialCode}` : `+${selectedDialCode}`}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search country or code..." />
                            <CommandList>
                              <CommandEmpty>No country found.</CommandEmpty>
                              <CommandGroup>
                                {countriesList.map((c) => (
                                  <CommandItem
                                    key={c.code}
                                    value={`${c.name} ${c.code} ${c.dialCode}`}
                                    onSelect={() => {
                                      setSelectedDialCode(c.dialCode)
                                      setSelectedCountryCode(c.code)
                                      setOpenCountry(false)
                                    }}
                                    className="flex items-center justify-between py-2 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">{c.flag}</span>
                                      <span className="font-medium text-neutral-900">{c.name}</span>
                                      <span className="text-neutral-400 font-normal">(+{c.dialCode})</span>
                                    </div>
                                    {selectedCountryCode === c.code && (
                                      <Check className="h-4 w-4 text-[var(--hero-cta-orange)]" />
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                    <Input
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={isEmail ? "name@example.com" : "9949820346"}
                      className="h-12 rounded-xl flex-1"
                      autoComplete="username"
                    />
                  </div>
                </div>

                {isEmail ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold text-neutral-700">Password</p>
                      <button
                        type="button"
                        onClick={() => {
                          setError('')
                          setAuthView('forgot')
                        }}
                        className="text-xs font-semibold text-[var(--hero-cta-orange)] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
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
                  disabled={isLoading || sendingOtp || !identifier.trim() || (!isEmail && !isValidPhone) || (isEmail && !password)}
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
                        body: JSON.stringify({ phone: `+${selectedDialCode}${normalizedPhone}` }),
                      })
                      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; otp?: string }
                      if (!res.ok || !data.ok) throw new Error(data.error || 'otp_send_failed')
                      if (data.otp) {
                        setDevOtp(data.otp)
                      } else {
                        setDevOtp('')
                      }
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
                        setError('')
                        try {
                          const res = await fetch('/api/auth/otp/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phone: `+${selectedDialCode}${normalizedPhone}` }),
                          })
                          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; otp?: string }
                          if (!res.ok || !data.ok) throw new Error(data.error || 'otp_send_failed')
                          if (data.otp) {
                            setDevOtp(data.otp)
                          } else {
                            setDevOtp('')
                          }
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to send OTP.')
                        }
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
                        body: JSON.stringify({ phone: `+${selectedDialCode}${normalizedPhone}`, otp: otpValue }),
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
                    setDevOtp('')
                  }}
                >
                  Change number / email
                </Button>

                {devOtp && (
                  <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-center text-xs font-semibold text-amber-800 border border-amber-200">
                    [Development Mode] Your OTP is: <strong className="text-sm font-bold text-amber-900">{devOtp}</strong>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
