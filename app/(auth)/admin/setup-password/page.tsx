'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ADMIN_FEATURE_LABELS, type AdminFeatureKey } from '@/lib/auth/admin-features'
import { validatePassword } from '@/lib/validators/password'
import { PasswordRequirementsHint } from '@/components/password-requirements-hint'

function SetupPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPasswordErrors, setShowPasswordErrors] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoadError('Missing setup token. Please request a new setup link from your administrator.')
      setLoading(false)
      return
    }

    async function loadTokenInfo() {
      try {
        const res = await fetch(`/api/admin/setup-password/info?token=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load setup link details.')
        }
        setEmail(data.email)
        setName(data.name)
        setPermissions(data.permissions)
      } catch (err: any) {
        setLoadError(err?.message || 'Invalid or expired setup token.')
      } finally {
        setLoading(false)
      }
    }

    void loadTokenInfo()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Invalid or missing setup token.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (!validatePassword(password).valid) {
      setShowPasswordErrors(true)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/setup-password/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to set password.')
      }
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message || 'Failed to set password.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        <p className="text-sm font-medium text-neutral-500">Verifying invitation...</p>
      </div>
    )
  }

  return (
    <div className="bg-white px-4 py-10 md:py-16">
      <div className="mx-auto grid w-full max-w-5xl items-stretch gap-10 lg:grid-cols-2">
        {/* Left Side Branding Image */}
        <div className="flex justify-center lg:justify-start">
          <div className="flex w-full max-w-md flex-col">
            <div className="relative flex-1 overflow-hidden rounded-3xl bg-[#f6c84c] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.45)] min-h-[300px]">
              <Image
                src="/auth/auth-hero.png"
                alt=""
                fill
                className="object-cover"
                priority
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/15 to-transparent" />
            </div>
          </div>
        </div>

        {/* Right Side Card */}
        <Card className="w-full overflow-hidden rounded-2xl border-neutral-200 shadow-[0_22px_70px_-44px_rgba(15,23,42,0.35)]">
          <CardHeader className="space-y-2 text-center">
            {success ? (
              <>
                <div className="mx-auto mt-2">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600 ring-4 ring-green-50">
                    <span className="text-2xl font-bold">✓</span>
                  </div>
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Setup Complete</CardTitle>
                <p className="text-sm text-neutral-500">Your admin account is configured successfully</p>
              </>
            ) : loadError ? (
              <>
                <div className="mx-auto mt-2">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 ring-4 ring-red-50">
                    <span className="text-2xl font-bold">!</span>
                  </div>
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Invalid Invitation</CardTitle>
                <p className="text-sm text-neutral-500">The invitation setup link is invalid or has expired</p>
              </>
            ) : (
              <>
                <div className="mx-auto mt-2">
                  <Image src="/auth/icon-secure.png" alt="" width={70} height={70} className="mx-auto h-auto w-[70px]" />
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Set Up Admin Account</CardTitle>
                <p className="text-sm text-neutral-500">Welcome {name}! Choose a secure password below</p>
              </>
            )}
          </CardHeader>

          <CardContent className="px-6 pb-8 pt-2 md:px-8">
            {error ? (
              <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 whitespace-pre-line">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-neutral-600">
                  You can now log in to the admin portal using your email <strong>{email}</strong> and the new password.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={() => router.push('/admin-user/login')}
                    className="h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                  >
                    Go to Admin Login
                  </Button>
                </div>
              </div>
            ) : loadError ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-red-600">{loadError}</p>
                <div className="pt-2">
                  <Button
                    onClick={() => router.push('/admin-user/login')}
                    className="h-12 w-full rounded-xl bg-neutral-200 text-base font-semibold text-neutral-800 hover:bg-neutral-300"
                  >
                    Back to Login
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* User Info & Permissions Display */}
                <div className="space-y-3">
                  <div className="text-xs text-neutral-500">
                    <p>Email: <span className="font-semibold text-neutral-800">{email}</span></p>
                  </div>
                  
                  {permissions && (
                    <div className="space-y-1.5 rounded-xl bg-neutral-50 p-4 border border-neutral-100 max-h-[160px] overflow-y-auto">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Your Assigned Permissions</p>
                      <div className="grid gap-2 sm:grid-cols-2 text-xs">
                        {Object.entries(permissions)
                          .filter(([_, enabled]) => enabled === true)
                          .map(([key]) => {
                            const label = ADMIN_FEATURE_LABELS[key as AdminFeatureKey] || key
                            return (
                              <div key={key} className="flex items-center gap-1.5 text-neutral-700">
                                <span className="flex size-3.5 items-center justify-center rounded-full bg-green-100 text-[8px] text-green-700 font-bold">
                                  ✓
                                </span>
                                <span className="truncate">{label}</span>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-neutral-700">New Password</p>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setShowPasswordErrors(false)
                      }}
                      placeholder="Create a secure password"
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

                {/* Confirm Password */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-neutral-700">Confirm Password</p>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="h-12 rounded-xl pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                  disabled={submitting || !password || !confirmPassword}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting Password...
                    </>
                  ) : (
                    'Complete Account Setup'
                  )}
                </Button>

                <div className="pt-2 text-center text-xs text-neutral-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex size-4 items-center justify-center rounded-full bg-neutral-100 text-[10px] text-neutral-600 ring-1 ring-black/5">
                      ✓
                    </span>
                    Your account is secure &amp; encrypted
                  </span>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    }>
      <SetupPasswordForm />
    </Suspense>
  )
}
