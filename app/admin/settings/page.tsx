"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { User, Bell, Shield, Palette, Globe, Save, Settings, ArrowRight, LayoutDashboard, Clock, Eye, EyeOff, Lock, Camera, Loader2, Mail, Phone, CheckCircle2, Check, ChevronDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuthStore } from "@/lib/stores"
import { isClientSuperAdmin } from "@/lib/tickets/auth-headers"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { countriesList, getFlagEmoji, isValidPhoneNumber } from "@/lib/country-codes"
import { parsePhoneNumberFromString } from "libphonenumber-js"

const MANAGEABLE_PATHS = [
  { path: '/admin/providers', label: 'Providers (/admin/providers)' },
  { path: '/admin/integrations', label: 'Integrations (/admin/integrations)' },
  { path: '/admin/routing', label: 'Routing (/admin/routing)' },
  { path: '/admin/products', label: 'Products (/admin/products)' },
  { path: '/admin/cms', label: 'Website CMS (/admin/cms)' },
  { path: '/admin/customers', label: 'Customers (/admin/customers)' },
  { path: '/admin/support-tickets', label: 'Support Tickets (/admin/support-tickets)' },
  { path: '/admin/ads', label: 'Ads Manager (/admin/ads)' },
  { path: '/admin/reconciliation', label: 'Reconciliation (/admin/reconciliation)' },
  { path: '/admin/reports', label: 'Reports & Analytics (/admin/reports)' },
  { path: '/admin/analytics', label: 'Analytics (/admin/analytics)' },
  { path: '/admin/statistics', label: 'Statistics (/admin/statistics)' },
  { path: '/admin/settings', label: 'Settings (/admin/settings)' },
  { path: '/admin/staff', label: 'Staff Management (/admin/staff)' },
]

function SettingsContent() {
  const { user, setSession } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "profile")

  const isSuperAdmin = isClientSuperAdmin(user)
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [showPassMap, setShowPassMap] = useState<Record<string, boolean>>({})

  // Security password update states
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)

  // Global 2FA States & Handlers
  const [global2FAEnabled, setGlobal2FAEnabled] = useState(false)
  const [isSaving2FA, setIsSaving2FA] = useState(false)

  useEffect(() => {
    if (activeTab !== 'security') return
    async function loadGlobal2FA() {
      try {
        const res = await fetch('/api/admin/settings/2fa')
        if (res.ok) {
          const data = await res.json()
          setGlobal2FAEnabled(data.enabled ?? false)
        }
      } catch {
        // ignore
      }
    }
    void loadGlobal2FA()
  }, [activeTab])

  const handleToggle2FA = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super administrators can toggle global 2FA settings.')
      return
    }
    setIsSaving2FA(true)
    try {
      const targetState = !global2FAEnabled
      const res = await fetch('/api/admin/settings/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: targetState }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update 2FA status.')
      }

      setGlobal2FAEnabled(targetState)
      toast.success(targetState ? 'Global 2FA enabled' : 'Global 2FA disabled')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update 2FA status.')
    } finally {
      setIsSaving2FA(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields")
      return
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match")
      return
    }

    setIsUpdatingPassword(true)
    try {
      const res = await fetch('/api/profile/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        toast.success('Password updated successfully')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(data.error ?? 'Failed to update password')
      }
    } catch {
      toast.error('Failed to update password')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  useEffect(() => {
    if (!isSuperAdmin) return
    async function loadPasswords() {
      try {
        const res = await fetch('/api/admin/settings/page-passwords')
        if (res.ok) {
          const data = await res.json()
          if (data.passwords) {
            setPasswords(data.passwords)
          }
        }
      } catch {
        // ignore
      }
    }
    void loadPasswords()
  }, [isSuperAdmin])

  const handleSavePasswords = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/settings/page-passwords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwords }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        toast.success('Page passwords updated successfully')
      } else {
        toast.error(data.error ?? 'Failed to save passwords')
      }
    } catch {
      toast.error('Failed to save passwords')
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab) setActiveTab(tab)
  }, [searchParams])

  const handleTabChange = (val: string) => {
    setActiveTab(val)
    router.replace(`/admin/settings?tab=${val}`, { scroll: false })
  }

  // Profile form state
  const [name, setName] = useState(user?.name || "")
  const [email, setEmail] = useState(user?.email || "")
  const [phone, setPhone] = useState(user?.phone || "")

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Phone input states
  const [selectedCountryCode, setSelectedCountryCode] = useState('IN')
  const [selectedDialCode, setSelectedDialCode] = useState('91')
  const [openCountry, setOpenCountry] = useState(false)

  // OTP Verification Modal States
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

  useEffect(() => {
    if (!showVerifyModal) return
    if (verifyTimer <= 0) return
    const t = setInterval(() => setVerifyTimer((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [showVerifyModal, verifyTimer])

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [marketingEmails, setMarketingEmails] = useState(false)

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
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
      toast.success('Profile image updated successfully')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload image.')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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

  const saveNameOnly = async () => {
    setIsSaving(true)
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
      toast.success('Profile details updated successfully')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile.')
    } finally {
      setIsSaving(false)
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

  const normalizedPhone = phone.replace(/[^\d]/g, '')
  const fullPhone = normalizedPhone ? `+${selectedDialCode}${normalizedPhone}` : ''
  const isPhoneValid = phone.trim() === '' || isValidPhoneNumber(phone, selectedCountryCode)

  const handleSave = async () => {
    setIsSaving(true)
    const emailChanged = email.trim().toLowerCase() !== (user?.email ?? '').trim().toLowerCase()
    const phoneChanged = fullPhone !== (user?.phone ?? '').trim()

    if (emailChanged) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      if (!emailRegex.test(email.trim()) || email.includes('..')) {
        toast.error('Please enter a valid email address.')
        setIsSaving(false)
        return
      }
    }

    if (phoneChanged && phone.trim() !== '') {
      if (!isValidPhoneNumber(phone, selectedCountryCode)) {
        toast.error('Invalid phone number for the selected country.')
        setIsSaving(false)
        return
      }
    }

    try {
      await fetch('/api/profile/locale', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, country: user?.countryCode, language: 'en', currency: 'USD' }),
      }).catch(() => { })

      if (emailChanged || phoneChanged) {
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
      } else {
        await saveNameOnly()
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className={cn("grid w-full", isSuperAdmin ? "grid-cols-6" : "grid-cols-5")}>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">System</span>
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="passwords" className="gap-2">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Passwords</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageChange}
                    accept="image/png, image/jpeg, image/jpg"
                    className="hidden"
                  />
                  <Avatar className="h-20 w-20 ring-2 ring-neutral-200">
                    <AvatarImage src={user?.avatar} className="object-cover" />
                    <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                      {user?.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    variant="outline"
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white shadow-sm border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-neutral-800">Profile Picture</h3>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG or GIF. Max size 2MB.
                  </p>
                </div>
              </div>

              <Separator />

              {/* Form Fields */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isSuperAdmin}
                  />
                  {!isSuperAdmin && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Email address changes are disabled for administrators. Contact a super admin if you need to update your email.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
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
                            {selectedCountryCode ? `${selectedDialCode}` : `+${selectedDialCode}`}
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
                                    <Check className="h-4 w-4 text-primary" />
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter your phone number"
                      className={cn("h-10 rounded-xl flex-1", !isPhoneValid && "border-destructive focus-visible:ring-destructive")}
                    />
                  </div>
                  {!isPhoneValid && (
                    <p className="text-xs text-destructive mt-1">
                      Please enter a valid phone number for the selected country.
                    </p>
                  )}
                </div>
                {/* <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select defaultValue="utc-5">
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utc-8">Pacific Time (UTC-8)</SelectItem>
                      <SelectItem value="utc-7">Mountain Time (UTC-7)</SelectItem>
                      <SelectItem value="utc-6">Central Time (UTC-6)</SelectItem>
                      <SelectItem value="utc-5">Eastern Time (UTC-5)</SelectItem>
                      <SelectItem value="utc">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div> */}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose how you want to receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via email
                    </p>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive push notifications on your device
                    </p>
                  </div>
                  <Switch
                    checked={pushNotifications}
                    onCheckedChange={setPushNotifications}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive transaction alerts via SMS
                    </p>
                  </div>
                  <Switch
                    checked={smsNotifications}
                    onCheckedChange={setSmsNotifications}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Marketing Emails</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive promotional offers and updates
                    </p>
                  </div>
                  <Switch
                    checked={marketingEmails}
                    onCheckedChange={setMarketingEmails}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage your password and security preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPass ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-10 rounded-xl pr-10 border-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                      aria-label={showCurrentPass ? 'Hide password' : 'Show password'}
                    >
                      {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="h-10 rounded-xl pr-10 border-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                      aria-label={showNewPass ? 'Hide password' : 'Show password'}
                    >
                      {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="h-10 rounded-xl pr-10 border-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                      aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button onClick={handleUpdatePassword} disabled={isUpdatingPassword} className="rounded-xl bg-neutral-900 text-white hover:bg-neutral-800">
                {isUpdatingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium">Two-Factor Authentication</h3>
                <p className="text-sm text-muted-foreground">
                  {global2FAEnabled 
                    ? "Two-factor authentication is globally enabled for all administrators and super administrators." 
                    : "Add an extra layer of security to all administrative accounts"}
                </p>
                <Button 
                  variant={global2FAEnabled ? "destructive" : "outline"}
                  onClick={handleToggle2FA}
                  disabled={isSaving2FA || !isSuperAdmin}
                >
                  {isSaving2FA ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {global2FAEnabled ? "Disabling..." : "Enabling..."}
                    </>
                  ) : (
                    global2FAEnabled ? "Disable 2FA" : "Enable 2FA"
                  )}
                </Button>
                {!isSuperAdmin && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Only super administrators can configure global security policies.
                  </p>
                )}
              </div>

              <Separator />


            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the look and feel of the application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select defaultValue="en">
                  <SelectTrigger className="w-full md:w-[200px]">
                    <Globe className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Currency Display</Label>
                <Select defaultValue="usd">
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD ($)</SelectItem>
                    <SelectItem value="eur">EUR</SelectItem>
                    <SelectItem value="gbp">GBP</SelectItem>
                    <SelectItem value="inr">INR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="flex h-full flex-col">
              <CardHeader>
                <CardTitle>Duplicate Detection</CardTitle>
                <CardDescription>Suggested duplicate plan matches for review.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 text-sm text-muted-foreground">Manage duplicate detection.</CardContent>
              <CardFooter>
                <Button asChild className="w-full sm:w-auto">
                  <a href="/admin/settings/duplicates">
                    Open
                    <ArrowRight className="ml-2 size-4" />
                  </a>
                </Button>
              </CardFooter>
            </Card>

            <Card className="flex h-full flex-col">
              <CardHeader>
                <CardTitle>Sync Logs</CardTitle>
                <CardDescription>Historical sync runs, counts, errors, and retries.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 text-sm text-muted-foreground">Manage sync logs.</CardContent>
              <CardFooter>
                <Button asChild className="w-full sm:w-auto">
                  <a href="/admin/settings/sync-logs">
                    Open
                    <ArrowRight className="ml-2 size-4" />
                  </a>
                </Button>
              </CardFooter>
            </Card>

            <Card className="flex h-full flex-col">
              <CardHeader>
                <CardTitle>Cron Status</CardTitle>
                <CardDescription>Cron and queue status.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 text-sm text-muted-foreground">Manage cron status.</CardContent>
              <CardFooter>
                <Button asChild className="w-full sm:w-auto">
                  <a href="/admin/settings/cron-status">
                    Open
                    <ArrowRight className="ml-2 size-4" />
                  </a>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="passwords">
            <Card>
              <CardHeader>
                <CardTitle>Page Passwords</CardTitle>
                <CardDescription>
                  Set passwords for specific sections of the admin console. Users with the "admin" role will be prompted to enter these passwords to gain access. Leave blank to disable protection.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {MANAGEABLE_PATHS.map((item) => {
                    const isVisible = showPassMap[item.path] || false
                    return (
                      <div key={item.path} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-100 pb-4 last:border-0 last:pb-0">
                        <div className="space-y-0.5">
                          <Label className="font-semibold text-neutral-800">{item.label}</Label>
                          <p className="text-xs text-muted-foreground">Path: {item.path}</p>
                        </div>
                        <div className="relative w-full sm:w-64">
                          <Input
                            type={isVisible ? 'text' : 'password'}
                            value={passwords[item.path] || ''}
                            onChange={(e) => setPasswords(prev => ({ ...prev, [item.path]: e.target.value }))}
                            placeholder="No password set"
                            className="h-10 rounded-xl pr-10 border-neutral-200"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassMap(prev => ({ ...prev, [item.path]: !isVisible }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                            aria-label={isVisible ? 'Hide password' : 'Show password'}
                          >
                            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <Separator />
                <div className="flex justify-end">
                  <Button onClick={handleSavePasswords} disabled={isSaving} className="rounded-xl h-11 bg-neutral-900 text-white hover:bg-neutral-800">
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? "Saving..." : "Save Passwords"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

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
                    Resend code in <span className="font-semibold text-primary">00:{String(verifyTimer).padStart(2, '0')}</span>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={sendingUpdateOtp}
                    className="font-semibold text-primary hover:underline disabled:opacity-50"
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
                  className="flex-1 rounded-xl bg-primary text-primary-foreground hover:brightness-105 h-11"
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

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  )
}
