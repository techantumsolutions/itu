'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/lib/stores'
import { Camera, Mail, Phone, Calendar, Gift, Loader2, Shield, Eye, EyeOff, CheckCircle2, Lock, Check, ChevronDown } from 'lucide-react'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { countriesList, getFlagEmoji } from '@/lib/country-codes'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

export default function AccountProfilePage() {
  const { user, setSession } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // States for "Complete Registration" flow
  const [regStep, setRegStep] = useState<'input' | 'otp'>('input')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [showRegPassword, setShowRegPassword] = useState(false)
  const [regOtp, setRegOtp] = useState('')
  const [regOtpTimer, setRegOtpTimer] = useState(30)
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState('')
  const [sendingRegOtp, setSendingRegOtp] = useState(false)
  const [verifyingRegOtp, setVerifyingRegOtp] = useState(false)

  // States for verification modal when updating email/phone
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyType, setVerifyType] = useState<'email' | 'phone' | 'both'>('email')
  const [verifyStep, setVerifyStep] = useState<'email' | 'phone'>('email')
  const [verifyOtpValue, setVerifyOtpValue] = useState('')
  const [verifyTimer, setVerifyTimer] = useState(30)
  const [verifyError, setVerifyError] = useState('')
  const [verifySuccess, setVerifySuccess] = useState('')
  const [verifyDevOtp, setVerifyDevOtp] = useState('')
  const [isVerifyingUpdate, setIsVerifyingUpdate] = useState(false)
  const [sendingUpdateOtp, setSendingUpdateOtp] = useState(false)

  const [selectedCountryCode, setSelectedCountryCode] = useState('IN')
  const [selectedDialCode, setSelectedDialCode] = useState('91')
  const [openCountry, setOpenCountry] = useState(false)

  const resetPhoneFields = (userObj: any) => {
    const userPhone = userObj?.phone || ''
    if (userPhone.startsWith('+')) {
      const parsed = parsePhoneNumberFromString(userPhone)
      if (parsed) {
        const cCode = parsed.country || 'IN'
        const dCode = parsed.countryCallingCode || '91'
        setSelectedCountryCode(cCode)
        setSelectedDialCode(dCode)
        setPhone(parsed.nationalNumber as string)
        return
      }
    }
    
    const profileCountry = userObj?.country || 'IN'
    setSelectedCountryCode(profileCountry)
    const foundCountry = countriesList.find(c => c.code === profileCountry)
    const dCode = foundCountry?.dialCode || userObj?.countryCode || '91'
    setSelectedDialCode(dCode)
    
    let displayVal = userPhone
    if (displayVal.startsWith(`+${dCode}`)) {
      displayVal = displayVal.slice(dCode.length + 1)
    } else if (displayVal.startsWith(dCode)) {
      displayVal = displayVal.slice(dCode.length)
    }
    setPhone(displayVal)
  }

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setEmail(user.email || '')
      resetPhoneFields(user)
    }
  }, [user])

  const normalizedPhone = phone.replace(/[^\d]/g, '')
  const fullPhone = normalizedPhone ? `+${selectedDialCode}${normalizedPhone}` : ''

  useEffect(() => {
    if (regStep !== 'otp') return
    if (regOtpTimer <= 0) return
    const t = setInterval(() => setRegOtpTimer((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [regStep, regOtpTimer])

  useEffect(() => {
    if (!showVerifyModal) return
    if (verifyTimer <= 0) return
    const t = setInterval(() => setVerifyTimer((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [showVerifyModal, verifyTimer])

  if (!user) return null

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      })
    : 'N/A'

  const saveNameOnly = async () => {
    setUpdating(true)
    setError('')
    try {
      const latestUser = useAuthStore.getState().user
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: latestUser?.phone || '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update profile.')
      }

      setSession(data.user)
      setIsEditing(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile.')
    } finally {
      setUpdating(false)
    }
  }

  const sendUpdateVerificationOtp = async (type: 'email' | 'phone', value: string) => {
    setSendingUpdateOtp(true)
    setVerifyError('')
    setVerifyDevOtp('')
    try {
      const res = await fetch('/api/profile/update/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value: value.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to send verification code.')
      }

      if (data.otp) {
        setVerifyDevOtp(data.otp)
      }
      setVerifyOtpValue('')
      setVerifyTimer(30)
    } catch (err: any) {
      setVerifyError(err?.message || 'Failed to send verification code.')
    } finally {
      setSendingUpdateOtp(false)
    }
  }

  const handleVerifyUpdateOtp = async () => {
    setVerifyError('')
    setIsVerifyingUpdate(true)
    const targetValue = verifyStep === 'email' ? email : fullPhone
    try {
      const res = await fetch('/api/profile/update/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: verifyStep,
          value: targetValue.trim(),
          otp: verifyOtpValue.trim()
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Verification failed.')
      }

      // Update local session
      setSession(data.user)

      if (verifyType === 'both' && verifyStep === 'email') {
        // Move to phone verification
        setVerifyStep('phone')
        setVerifyOtpValue('')
        setVerifyTimer(30)
        setVerifyDevOtp('')
        setVerifySuccess('Email verified! Sending phone OTP...')
        setTimeout(async () => {
          setVerifySuccess('')
          await sendUpdateVerificationOtp('phone', fullPhone)
        }, 1500)
      } else {
        setVerifySuccess('Verification successful!')
        setTimeout(async () => {
          await saveNameOnly()
          setShowVerifyModal(false)
        }, 1000)
      }
    } catch (err: any) {
      setVerifyError(err?.message || 'Verification failed. Please try again.')
    } finally {
      setIsVerifyingUpdate(false)
    }
  }

  const handleSaveChanges = async () => {
    setError('')
    const emailChanged = email.trim().toLowerCase() !== (user?.email ?? '').trim().toLowerCase()
    const phoneChanged = fullPhone !== (user?.phone ?? '').trim()

    if (emailChanged || phoneChanged) {
      setUpdating(true)
      try {
        // Validate uniqueness before opening modal or sending OTP
        const checkRes = await fetch('/api/profile/update/check-unique', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailChanged ? email.trim() : undefined,
            phone: phoneChanged ? fullPhone : undefined,
          }),
        })
        const checkData = await checkRes.json().catch(() => ({}))
        if (!checkRes.ok || !checkData.ok) {
          throw new Error(checkData.error || 'Validation failed. Please try again.')
        }

        // Both are unique! Trigger verification modal
        let type: 'email' | 'phone' | 'both' = 'email'
        if (emailChanged && phoneChanged) {
          type = 'both'
        } else if (phoneChanged) {
          type = 'phone'
        }

        setVerifyType(type)
        setVerifyStep(emailChanged ? 'email' : 'phone')
        setVerifyOtpValue('')
        setVerifyTimer(30)
        setVerifyError('')
        setVerifySuccess('')
        setVerifyDevOtp('')
        setShowVerifyModal(true)

        await sendUpdateVerificationOtp(emailChanged ? 'email' : 'phone', emailChanged ? email : fullPhone)
      } catch (err: any) {
        setError(err?.message || 'Failed to update profile.')
      } finally {
        setUpdating(false)
      }
      return
    }

    await saveNameOnly()
  }

  const handleCancel = () => {
    setName(user.name || '')
    setEmail(user.email || '')
    resetPhoneFields(user)
    setError('')
    setIsEditing(false)
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/profile/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to upload image.')
      }

      setSession(data.user)
    } catch (err: any) {
      setError(err?.message || 'Failed to upload image.')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')
    setRegSuccess('')

    if (!regEmail.includes('@')) {
      setRegError('Please enter a valid email address')
      return
    }

    if (regPassword.length < 6) {
      setRegError('Password must be at least 6 characters long')
      return
    }

    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match')
      return
    }

    setSendingRegOtp(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail.trim().toLowerCase(),
          password: regPassword.trim(),
          name: name.trim() || user.name
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to send verification code. Please try again.')
      }

      setRegOtp('')
      setRegOtpTimer(30)
      setRegStep('otp')
    } catch (err: any) {
      setRegError(err?.message || 'Registration failed. Please try again.')
    } finally {
      setSendingRegOtp(false)
    }
  }

  const handleVerifyEmailOtp = async () => {
    setRegError('')
    setVerifyingRegOtp(true)
    try {
      const res = await fetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail.trim().toLowerCase(),
          otp: regOtp.trim()
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Verification failed. Please try again.')
      }

      // Update the user session in store
      setSession(data.user)
      setRegSuccess('Your account is now fully registered!')
    } catch (err: any) {
      setRegError(err?.message || 'OTP verification failed.')
    } finally {
      setVerifyingRegOtp(false)
    }
  }

  const handleResendEmailOtp = async () => {
    setRegError('')
    setSendingRegOtp(true)
    try {
      const res = await fetch('/api/auth/register/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail.trim().toLowerCase() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to resend code.')
      }
      setRegOtp('')
      setRegOtpTimer(30)
    } catch (err: any) {
      setRegError(err?.message || 'Failed to resend code.')
    } finally {
      setSendingRegOtp(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">Manage your account information</p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="relative">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                accept="image/png, image/jpeg, image/jpg"
                className="hidden"
              />
              <Avatar className="h-24 w-24">
                {user.avatar && (
                  <AvatarImage src={user.avatar} alt={user.name} className="object-cover" />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                variant="secondary"
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage || !user.is_registered_with_email}
              >
                {uploadingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{user.name}</h2>
              <p className="text-muted-foreground">{user.email || 'No email set'}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary">{user.role}</Badge>
                <Badge variant="outline" className="gap-1">
                  <Gift className="h-3 w-3" />
                  {user.rewardPoints || 0} points
                </Badge>
              </div>
            </div>
            <Button
              variant={isEditing ? 'outline' : 'default'}
              disabled={!user.is_registered_with_email}
              onClick={() => {
                if (isEditing) {
                  handleCancel()
                } else {
                  setIsEditing(true)
                }
              }}
            >
              {isEditing ? 'Cancel' : 'Edit Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account Details */}
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user.is_registered_with_email && (
            <div className="rounded-xl bg-amber-50 border border-amber-200/50 px-4 py-3 text-sm font-medium text-amber-800 flex items-start gap-2.5">
              <Shield className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Please complete your email &amp; password setup below to unlock profile editing, rewards, and security preferences.
              </span>
            </div>
          )}

          {error ? (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              {isEditing ? (
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{user.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              {isEditing ? (
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="h-10 rounded-xl"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {user.email || 'Not set'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phone Number</label>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Popover open={openCountry} onOpenChange={setOpenCountry}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCountry}
                        className="flex h-10 items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 shrink-0 min-w-[110px] justify-between shadow-none"
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
                          <CommandGroup className="max-h-[200px] overflow-y-auto">
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
                  <Input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter your phone number"
                    className="h-10 rounded-xl flex-1"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {user.phone || 'Not set'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Member Since</label>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{memberSince}</p>
              </div>
            </div>
          </div>

          {isEditing && (
            <>
              <Separator />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCancel} disabled={updating}>
                  Cancel
                </Button>
                <Button onClick={handleSaveChanges} disabled={updating}>
                  {updating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Complete Registration Card */}
      {!user.is_registered_with_email && (
        <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50/40 to-orange-50/30 shadow-md backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-amber-100/50 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-sm ring-4 ring-amber-50">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-amber-900">Secure Your Account</CardTitle>
                <CardDescription className="text-amber-800/80 text-xs">
                  Set up email &amp; password login to protect your wallet and access all account features.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {regError && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">
                {regError}
              </div>
            )}
            {regSuccess && (
              <div className="mb-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {regSuccess}
              </div>
            )}

            {regStep === 'input' ? (
              <form onSubmit={handleSendEmailOtp} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-amber-600" />
                      Email Address
                    </label>
                    <Input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="h-10 rounded-xl bg-white border-amber-200/60 focus-visible:ring-amber-500"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-amber-600" />
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showRegPassword ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="h-10 rounded-xl bg-white border-amber-200/60 pr-10 focus-visible:ring-amber-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-600 hover:text-amber-900"
                      >
                        {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-amber-600" />
                      Confirm Password
                    </label>
                    <Input
                      type="password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="h-10 rounded-xl bg-white border-amber-200/60 focus-visible:ring-amber-500"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm px-6 h-10"
                    disabled={sendingRegOtp}
                  >
                    {sendingRegOtp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending Code...
                      </>
                    ) : (
                      'Send Verification Code'
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-5 max-w-md mx-auto py-2">
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-amber-900">Verify your email address</p>
                  <p className="text-xs text-amber-800/80">We sent a 6-digit code to <strong className="font-semibold">{regEmail}</strong></p>
                </div>

                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={regOtp} onChange={setRegOtp} containerClassName="justify-center gap-2">
                    <InputOTPGroup className="gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-11 w-11 rounded-lg border border-amber-200 bg-white text-base text-amber-950 font-bold focus:border-amber-500 focus:ring-amber-500 shadow-sm"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <div className="text-center text-xs text-amber-800/70">
                  {regOtpTimer > 0 ? (
                    <>
                      Resend code in <span className="font-semibold text-amber-950">00:{String(regOtpTimer).padStart(2, '0')}</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="font-semibold text-amber-800 hover:text-amber-950 underline decoration-dotted"
                      onClick={handleResendEmailOtp}
                      disabled={sendingRegOtp}
                    >
                      Resend code
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button
                    variant="ghost"
                    className="flex-1 rounded-xl text-amber-800 hover:bg-amber-100/50 hover:text-amber-950 h-10 border border-amber-200/40"
                    onClick={() => {
                      setRegStep('input')
                      setRegOtp('')
                      setRegError('')
                    }}
                  >
                    Change Details
                  </Button>
                  <Button
                    className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm h-10"
                    disabled={verifyingRegOtp || regOtp.length !== 6}
                    onClick={handleVerifyEmailOtp}
                  >
                    {verifyingRegOtp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify & Link'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{user.rewardPoints || 0}</p>
              <p className="text-sm text-muted-foreground">Reward Points</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">12</p>
              <p className="text-sm text-muted-foreground">Total Recharges</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">3</p>
              <p className="text-sm text-muted-foreground">Saved Contacts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verification Overlay Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-neutral-200 shadow-2xl bg-white overflow-hidden animate-in fade-in zoom-in duration-200">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-4 ring-amber-50 mb-3">
                <Shield className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-bold">
                {verifyStep === 'email' ? 'Verify Email Change' : 'Verify Mobile Change'}
              </CardTitle>
              <CardDescription className="text-sm text-neutral-500">
                {verifyStep === 'email'
                  ? `We sent a 6-digit code to your new email ${email}`
                  : `Please enter the 6-digit code sent to ${phone}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {verifyError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">
                  {verifyError}
                </div>
              )}
              {verifySuccess && (
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {verifySuccess}
                </div>
              )}

              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={verifyOtpValue}
                  onChange={setVerifyOtpValue}
                  containerClassName="justify-center gap-2"
                >
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
                {verifyTimer > 0 ? (
                  <>
                    Resend code in <span className="font-semibold text-[var(--hero-cta-orange)]">00:{String(verifyTimer).padStart(2, '0')}</span>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={sendingUpdateOtp}
                    className="font-semibold text-[var(--hero-cta-orange)] hover:underline disabled:opacity-50"
                    onClick={() => sendUpdateVerificationOtp(verifyStep, verifyStep === 'email' ? email : phone)}
                  >
                    {sendingUpdateOtp ? 'Resending...' : 'Resend code'}
                  </button>
                )}
              </div>

              {verifyDevOtp && (
                <div className="rounded-lg bg-amber-50 p-2.5 text-center text-xs font-semibold text-amber-800 border border-amber-200">
                  [Development Mode] Your OTP is: <strong className="text-sm font-bold text-amber-900">{verifyDevOtp}</strong>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl h-11"
                  disabled={isVerifyingUpdate}
                  onClick={() => setShowVerifyModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-xl bg-[var(--hero-cta-orange)] text-white hover:brightness-105 h-11"
                  disabled={isVerifyingUpdate || verifyOtpValue.length !== 6}
                  onClick={handleVerifyUpdateOtp}
                >
                  {isVerifyingUpdate ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Code'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
