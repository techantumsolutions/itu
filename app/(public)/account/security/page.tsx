'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/lib/stores'
import { Shield, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { validatePassword } from '@/lib/validators/password'
import { PasswordRequirementsHint } from '@/components/password-requirements-hint'

export default function AccountSecurityPage() {
  const { user } = useAuthStore()
  
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPasswordErrors, setShowPasswordErrors] = useState(false)

  if (!user) return null

  const isRegistered = user.is_registered_with_email ?? false

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    if (!validatePassword(newPassword).valid) {
      setShowPasswordErrors(true)
      return
    }

    setIsLoading(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['x-user-id'] = user.id

      const res = await fetch('/api/profile/security/change-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password.')
      }

      setSuccess('Your password has been changed successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err?.message || 'Failed to change password. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security Settings</h1>
        <p className="text-muted-foreground">Manage your credentials and login safety preferences</p>
      </div>

      {!isRegistered ? (
        <Card className="border-amber-200/60 bg-amber-50/40 shadow-sm backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-sm ring-4 ring-amber-50">
                <Shield className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg font-bold text-amber-900">Registration Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-amber-800/90 leading-relaxed">
            Please complete your registration first by adding an email and password under the **Profile** tab. 
            Once your account is registered, you will be able to manage your password and access additional security controls.
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-neutral-200/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-800 shadow-sm">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-neutral-900">Change Password</CardTitle>
                <CardDescription>Update your account access password regularly</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md pt-2">
            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 whitespace-pre-line">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-pass">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current-pass"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 rounded-xl pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-pass">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-pass"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setShowPasswordErrors(false)
                    }}
                    placeholder="Create a secure password"
                    className="h-10 rounded-xl pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordRequirementsHint className="mt-1" password={newPassword} showErrors={showPasswordErrors} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-pass">Confirm New Password</Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="h-10 rounded-xl"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full h-10 rounded-xl bg-neutral-900 text-white font-semibold hover:bg-neutral-800"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Change Password'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
