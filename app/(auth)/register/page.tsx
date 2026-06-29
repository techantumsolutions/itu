'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff, Loader2, CheckCircle2, ArrowLeft, Check, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useCMSStore } from '@/lib/cms-store'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { validatePassword } from '@/lib/validators/password'
import { PasswordRequirementsHint } from '@/components/password-requirements-hint'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  countriesList,
  getFlagEmoji,
  getNationalPhoneDigitBounds,
  validateNationalPhoneDigits,
} from '@/lib/country-codes'

export default function RegisterPage() {
  const router = useRouter()
  const { content, hasHydrated } = useCMSStore()
  
  const [step, setStep] = useState<'form' | 'otp' | 'success'>('form')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [phone, setPhone] = useState('')
  const [selectedCountryCode, setSelectedCountryCode] = useState('IN')
  const [selectedDialCode, setSelectedDialCode] = useState('91')
  const [openCountry, setOpenCountry] = useState(false)
  const [showPhoneError, setShowPhoneError] = useState(false)

  const phoneBounds = useMemo(
    () => getNationalPhoneDigitBounds(selectedCountryCode),
    [selectedCountryCode],
  )
  const phoneValidation = useMemo(
    () => (phone.trim() ? validateNationalPhoneDigits(phone, selectedCountryCode) : null),
    [phone, selectedCountryCode],
  )

  // OTP states
  const [otpValue, setOtpValue] = useState('')
  const [otpTimer, setOtpTimer] = useState(30)
  const [isLoading, setIsLoading] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [showPasswordErrors, setShowPasswordErrors] = useState(false)

  useEffect(() => {
    if (step !== 'otp') return
    if (otpTimer <= 0) return
    const t = setInterval(() => setOtpTimer((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [step, otpTimer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!validatePassword(password).valid) {
      setShowPasswordErrors(true)
      return
    }

    if (!acceptTerms) {
      setError('Please accept the terms and conditions')
      return
    }

    if (phone.trim()) {
      if (!phoneValidation?.valid) {
        setShowPhoneError(true)
        setError(phoneValidation?.error || 'Enter a valid mobile number for this country')
        return
      }
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase(), 
          password: password.trim(), 
          name: name.trim(),
          ...(phone.trim()
            ? {
                phone: phoneValidation?.digits || phone.replace(/\D/g, ''),
                countryCode: selectedCountryCode,
                dialCode: selectedDialCode,
              }
            : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to send verification code. Please try again.')
      }

      setOtpValue('')
      setOtpTimer(30)
      setStep('otp')
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOTP = async () => {
    setError('')
    setVerifyingOtp(true)
    try {
      const res = await fetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase(), 
          otp: otpValue 
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Verification failed. Please try again.')
      }

      setStep('success')
    } catch (err: any) {
      setError(err?.message || 'OTP verification failed.')
    } finally {
      setVerifyingOtp(false)
    }
  }

  const handleResendOTP = async () => {
    setError('')
    setSendingOtp(true)
    try {
      const res = await fetch('/api/auth/register/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to resend code.')
      }
      setOtpValue('')
      setOtpTimer(30)
    } catch (err: any) {
      setError(err?.message || 'Failed to resend code.')
    } finally {
      setSendingOtp(false)
    }
  }

  return (
    <div className="bg-white px-4 py-10 md:py-16">
      <div className="mx-auto grid w-full max-w-5xl items-stretch gap-10 lg:grid-cols-2">
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
          {step === 'form' && (
            <>
              <CardHeader className="space-y-2 text-center">
                <div className="mx-auto mt-2">
                  <Image src="/auth/icon-secure.png" alt="" width={70} height={70} className="mx-auto h-auto w-[70px]" />
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Create your account</CardTitle>
                <p className="text-sm text-neutral-500">Enter your details to get started</p>
              </CardHeader>

              <CardContent className="overflow-y-auto px-6 pb-8 pt-2 md:px-8">
                {error ? <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 whitespace-pre-line">{error}</div> : null}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-neutral-700">Full name</p>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="h-12 rounded-xl" required />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-neutral-700">Email</p>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-12 rounded-xl" required />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-neutral-700">Mobile number <span className="font-normal text-neutral-400">(optional)</span></p>
                    <div className="flex items-center gap-2">
                      <Popover open={openCountry} onOpenChange={setOpenCountry}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCountry}
                            className="flex h-12 items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 shrink-0 min-w-[110px] justify-between shadow-none"
                          >
                            <span className="truncate">
                              {selectedCountryCode
                                ? `${getFlagEmoji(selectedCountryCode)} +${selectedDialCode}`
                                : `+${selectedDialCode}`}
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
                                      setShowPhoneError(false)
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
                      <Input
                        type="tel"
                        inputMode="numeric"
                        value={phone}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, phoneBounds.maxDigits)
                          setPhone(digits)
                          setShowPhoneError(false)
                        }}
                        placeholder="Contact number"
                        className="h-12 rounded-xl flex-1"
                        autoComplete="tel-national"
                        maxLength={phoneBounds.maxDigits}
                      />
                    </div>
                    {showPhoneError && phoneValidation && !phoneValidation.valid ? (
                      <p className="text-xs font-medium text-red-600">{phoneValidation.error}</p>
                    ) : phone.trim() ? (
                      <p className="text-xs text-neutral-500">
                        Enter {phoneBounds.minDigits === phoneBounds.maxDigits
                          ? `${phoneBounds.minDigits} digits`
                          : `${phoneBounds.minDigits}–${phoneBounds.maxDigits} digits`} for this country
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-neutral-700">Password</p>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setShowPasswordErrors(false)
                        }}
                        placeholder="Create a password"
                        className="h-12 rounded-xl pr-10"
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
                    <PasswordRequirementsHint className="mt-1" password={password} showErrors={showPasswordErrors} />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-neutral-700">Confirm password</p>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className="h-12 rounded-xl"
                      required
                    />
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox id="terms" checked={acceptTerms} onCheckedChange={(checked) => setAcceptTerms(checked as boolean)} className="mt-0.5" />
                    <label htmlFor="terms" className="text-sm leading-tight text-neutral-600">
                      I agree to the{' '}
                      <Link href="/terms" className="font-semibold text-[var(--hero-cta-orange)] hover:underline">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link href="/privacy" className="font-semibold text-[var(--hero-cta-orange)] hover:underline">
                        Privacy Policy
                      </Link>
                    </label>
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending verification…
                      </>
                    ) : (
                      'Create account'
                    )}
                  </Button>
                </form>

                <p className="mt-5 text-center text-sm text-neutral-500">
                  Already have an account?{' '}
                  <Link href="/login" className="font-semibold text-[var(--hero-cta-orange)] hover:underline">
                    Sign in
                  </Link>
                </p>
              </CardContent>
            </>
          )}

          {step === 'otp' && (
            <>
              <CardHeader className="space-y-2 text-center">
                <div className="mx-auto mt-2">
                  <Image src="/auth/otp-icon.png" alt="" width={66} height={66} className="mx-auto h-auto w-[66px]" />
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Verify your email</CardTitle>
                <div className="space-y-0.5 text-sm text-neutral-500">
                  <p>We just sent a 6-digit verification code to</p>
                  <p className="font-semibold text-neutral-700">{email}</p>
                </div>
              </CardHeader>

              <CardContent className="px-6 pb-8 pt-2 md:px-8">
                {error ? <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 whitespace-pre-line">{error}</div> : null}

                <div className="mx-auto w-full max-w-sm space-y-6 pb-2">
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={otpValue} onChange={setOtpValue} containerClassName="justify-center gap-2">
                      <InputOTPGroup className="gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <InputOTPSlot
                            key={i}
                            index={i}
                            className="h-12 w-12 rounded-lg border border-neutral-200 bg-neutral-50 text-lg shadow-[0_1px_0_rgba(15,23,42,0.03)]"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <div className="text-center text-xs text-neutral-500">
                    {otpTimer > 0 ? (
                      <>
                        Resend code in <span className="font-semibold text-[var(--hero-cta-orange)]">00:{String(otpTimer).padStart(2, '0')}</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={sendingOtp}
                        className="font-semibold text-[var(--hero-cta-orange)] hover:underline disabled:opacity-50"
                        onClick={handleResendOTP}
                      >
                        {sendingOtp ? 'Resending...' : 'Resend code'}
                      </button>
                    )}
                  </div>

                  <Button
                    className="h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                    disabled={verifyingOtp || otpValue.length !== 6}
                    onClick={handleVerifyOTP}
                  >
                    {verifyingOtp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      'Verify & Register'
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    className="h-10 w-full rounded-xl text-sm font-semibold text-neutral-600 hover:bg-neutral-50 flex items-center justify-center gap-2"
                    onClick={() => {
                      setStep('form')
                      setOtpValue('')
                      setError('')
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to edit details
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 'success' && (
            <>
              <CardHeader className="space-y-2 text-center">
                <div className="mx-auto mt-4 text-green-500 flex justify-center">
                  <CheckCircle2 className="h-16 w-16" />
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl mt-4">Registration Successful!</CardTitle>
                <div className="space-y-0.5 text-sm text-neutral-500 max-w-sm mx-auto">
                  <p>Your email has been successfully verified.</p>
                  <p>Your account is now active and ready to use.</p>
                </div>
              </CardHeader>

              <CardContent className="px-6 pb-12 pt-6 md:px-8 flex flex-col items-center">
                <Button
                  className="h-12 w-full max-w-sm rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                  onClick={() => router.push('/login')}
                >
                  Go to Sign In
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
