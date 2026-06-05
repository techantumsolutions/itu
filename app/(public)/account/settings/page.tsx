'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLocalePreferencesStore, useAuthStore } from '@/lib/stores'
import { Settings, Bell, Globe, CheckCircle2 } from 'lucide-react'
import { countriesList } from '@/lib/country-codes'

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'ar', name: 'العربية' },
]

const currencies = [
  { code: 'USD', name: 'US Dollar ($)' },
  { code: 'EUR', name: 'Euro (€)' },
  { code: 'INR', name: 'Indian Rupee (₹)' },
  { code: 'GBP', name: 'British Pound (£)' },
]

export default function AccountSettingsPage() {
  const { user } = useAuthStore()
  const { regionCode, languageCode, currencyCode, setRegion, setLanguage, setCurrency, setManualOverride } = useLocalePreferencesStore()

  const [emailNotify, setEmailNotify] = useState(true)
  const [smsNotify, setSmsNotify] = useState(true)
  const [promoNotify, setPromoNotify] = useState(false)
  const [success, setSuccess] = useState('')

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault()
    setManualOverride(true)
    setSuccess('Settings updated successfully!')
    setTimeout(() => setSuccess(''), 3000)
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">Customize your regional settings and notification preferences</p>
      </div>

      {success && (
        <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 flex items-center gap-2 max-w-md">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
        {/* Regional Settings */}
        <Card className="rounded-2xl border-neutral-200/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-800 shadow-sm">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-neutral-900">Regional & Locale</CardTitle>
                <CardDescription>Configure your default region, language, and billing currency</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="region-select">Default Region</Label>
                <Select value={regionCode} onValueChange={(val) => setRegion(val)}>
                  <SelectTrigger id="region-select" className="rounded-xl h-10">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    {countriesList.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="mr-2">{c.flag}</span> {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lang-select">Display Language</Label>
                <Select value={languageCode} onValueChange={(val) => setLanguage(val)}>
                  <SelectTrigger id="lang-select" className="rounded-xl h-10">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="currency-select">Preferred Currency</Label>
                <Select value={currencyCode} onValueChange={(val) => setCurrency(val)}>
                  <SelectTrigger id="currency-select" className="rounded-xl h-10">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications Settings */}
        <Card className="rounded-2xl border-neutral-200/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-800 shadow-sm">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-neutral-900">Notification Preferences</CardTitle>
                <CardDescription>Manage how and when you receive order status updates and alert messages</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 divide-y divide-neutral-100 pt-2">
            <div className="flex items-center justify-between pb-4">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold text-neutral-900">Email Notifications</Label>
                <p className="text-xs text-muted-foreground">Receive invoices and transaction status receipts via email</p>
              </div>
              <Switch checked={emailNotify} onCheckedChange={setEmailNotify} />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold text-neutral-900">SMS / Mobile Alerts</Label>
                <p className="text-xs text-muted-foreground">Receive real-time text message notifications on delivery status</p>
              </div>
              <Switch checked={smsNotify} onCheckedChange={setSmsNotify} />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold text-neutral-900">Marketing & Promotional Offers</Label>
                <p className="text-xs text-muted-foreground">Get notified about discounts, double-points days, and voucher campaigns</p>
              </div>
              <Switch checked={promoNotify} onCheckedChange={setPromoNotify} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" className="rounded-xl h-10 px-8 bg-neutral-900 text-white font-semibold hover:bg-neutral-800">
            Save Preferences
          </Button>
        </div>
      </form>
    </div>
  )
}
