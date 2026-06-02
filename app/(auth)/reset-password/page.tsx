'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCMSStore } from '@/lib/cms-store'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const { content, hasHydrated } = useCMSStore()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Invalid or missing reset token.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to reset password.')
      }
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white px-4 py-10 md:py-16">
      <div className="mx-auto grid w-full max-w-5xl items-stretch gap-10 lg:grid-cols-2 lg:max-h-[700px]">
        {/* Left Side Branding Image */}
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

        {/* Right Side Reset Password Card */}
        <Card className="w-full overflow-hidden rounded-2xl border-neutral-200 shadow-[0_22px_70px_-44px_rgba(15,23,42,0.35)]">
          <CardHeader className="space-y-2 text-center">
            {success ? (
              <>
                <div className="mx-auto mt-2">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600 ring-4 ring-green-50">
                    <span className="text-2xl font-bold">✓</span>
                  </div>
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Password Updated</CardTitle>
                <p className="text-sm text-neutral-500">Your password has been changed successfully.</p>
              </>
            ) : (
              <>
                <div className="mx-auto mt-2">
                  <Image src="/auth/icon-secure.png" alt="" width={70} height={70} className="mx-auto h-auto w-[70px]" />
                </div>
                <CardTitle className="text-xl font-bold text-neutral-900 md:text-2xl">Choose New Password</CardTitle>
                <p className="text-sm text-neutral-500">Enter a secure new password for your account</p>
              </>
            )}
          </CardHeader>

          <CardContent className="px-6 pb-8 pt-2 md:px-8">
            {error ? (
              <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-neutral-600">
                  You can now log in to your account with your new password.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={() => router.push('/login')}
                    className="h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105"
                  >
                    Go to Login Page
                  </Button>
                </div>
              </div>
            ) : !token ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-red-600">
                  Invalid or missing password reset token. Please request a new password reset link from the login page.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={() => router.push('/login')}
                    className="h-12 w-full rounded-xl bg-neutral-200 text-base font-semibold text-neutral-800 hover:bg-neutral-300"
                  >
                    Back to Login
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-neutral-700">New Password</p>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
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
                      Updating Password...
                    </>
                  ) : (
                    'Update Password'
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
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
