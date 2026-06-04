"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { User, Bell, Shield, Palette, Globe, Save, Settings, ArrowRight, LayoutDashboard, Clock, Eye, EyeOff, Lock } from "lucide-react"
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
  const { user } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "profile")

  const isSuperAdmin = isClientSuperAdmin(user)
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [showPassMap, setShowPassMap] = useState<Record<string, boolean>>({})

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

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [marketingEmails, setMarketingEmails] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await fetch('/api/profile/locale', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, country: user?.countryCode, language: 'en', currency: 'USD' }),
      }).catch(() => {})
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
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                    {user?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Button variant="outline" size="sm">Change Avatar</Button>
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div className="space-y-2">
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
                </div>
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
                  <Input id="current-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input id="new-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input id="confirm-password" type="password" />
                </div>
              </div>

              <Button>Update Password</Button>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium">Two-Factor Authentication</h3>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security to your account
                </p>
                <Button variant="outline">Enable 2FA</Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium text-destructive">Danger Zone</h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your account and all associated data
                </p>
                <Button variant="destructive">Delete Account</Button>
              </div>
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
