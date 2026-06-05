'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

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
      const res = await fetch('/api/auth/admin-reset-password/verify', {
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
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50 px-4 py-12 md:py-20">
      <div className="mx-auto w-full max-w-md">
        <Card className="overflow-hidden rounded-2xl border-neutral-200 shadow-lg">
          <CardHeader className="space-y-3 border-b border-neutral-100 bg-white pb-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-neutral-900 text-amber-400 shadow-inner">
              <Shield className="size-7" aria-hidden />
            </div>
            <CardTitle className="text-xl font-bold text-neutral-900">
              {success ? 'Password Updated' : 'Reset Staff Password'}
            </CardTitle>
            <p className="text-sm text-neutral-500">
              {success
                ? 'Your password has been changed successfully.'
                : 'Enter a secure new password for your staff account'}
            </p>
          </CardHeader>

          <CardContent className="space-y-5 bg-white px-6 py-8">
            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-neutral-600">
                  You can now sign in to the staff console using your new password.
                </p>
                <Button
                  onClick={() => router.push('/admin-user/login')}
                  className="h-11 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
                >
                  Go to Login Page
                </Button>
              </div>
            ) : !token ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-red-600">
                  Invalid or missing password reset token. Please request a new link from the login page.
                </p>
                <Button
                  onClick={() => router.push('/admin-user/login')}
                  className="h-11 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
                >
                  Back to Login
                </Button>
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

                {/* Confirm Password */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-neutral-700">Confirm Password</p>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="h-11 rounded-xl pr-10"
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
                  className="h-11 w-full rounded-xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
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
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function AdminResetPasswordPage() {
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
