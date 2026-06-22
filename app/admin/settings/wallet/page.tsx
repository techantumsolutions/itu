'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Save, Loader2, RefreshCw, Wallet, Shield } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export default function WalletSettingsPage() {
  const [percentage, setPercentage] = useState<number>(100)
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings/wallet')
      if (res.ok) {
        const body = await res.json()
        setPercentage(body.percentage ?? 100)
      } else {
        toast.error('Failed to load wallet settings')
      }
    } catch {
      toast.error('Failed to load wallet settings')
    } finally {
      setLoading(false)
    }
  }

  const checkUserRole = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const body = await res.json()
        setIsSuperAdmin(body.user?.role === 'super_admin')
      }
    } catch {
      // Default to true to allow testing (server will reject anyway if unauthorized)
    }
  }

  useEffect(() => {
    void checkUserRole()
    void fetchSettings()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isSuperAdmin) {
      toast.error('Only super administrators can modify wallet settings.')
      return
    }
    if (percentage < 0 || percentage > 100) {
      toast.error('Percentage must be between 0 and 100.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentage }),
      })
      if (res.ok) {
        toast.success('Wallet consumption percentage updated successfully')
      } else {
        const body = await res.json()
        toast.error(body.error || 'Failed to save settings')
      }
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallet Settings</h1>
          <Link
            href="/admin/settings?tab=system"
            className="text-sm font-medium text-primary hover:underline flex items-center gap-1 mt-1"
          >
            <ArrowLeft className="size-3.5" />
            Back to settings
          </Link>
          <p className="mt-1 text-muted-foreground">
            Configure wallet payment rules, consumption caps, and usage limits.
          </p>
        </div>
        <div>
          <Button variant="outline" onClick={fetchSettings} disabled={loading}>
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <Card className="rounded-2xl border border-border/70 bg-card shadow-elevated-sm">
          <form onSubmit={handleSave}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-5 text-primary" />
                Consumption Settings
              </CardTitle>
              <CardDescription>
                Define the rules governing wallet balance usage on public checkout/topup summary page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin mr-2" />
                  Loading settings...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="percentage">Maximum Wallet Consumption Percentage</Label>
                    <div className="flex items-center gap-4">
                      <input
                        id="percentage-range"
                        type="range"
                        min="0"
                        max="100"
                        value={percentage}
                        onChange={(e) => setPercentage(Number(e.target.value))}
                        disabled={!isSuperAdmin}
                        className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="relative w-24 flex items-center">
                        <Input
                          id="percentage"
                          type="number"
                          min="0"
                          max="100"
                          value={percentage}
                          onChange={(e) => setPercentage(Math.min(100, Math.max(0, Number(e.target.value))))}
                          disabled={!isSuperAdmin}
                          className="pr-6 font-semibold"
                        />
                        <span className="absolute right-3 font-semibold text-neutral-500">%</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Specifies the maximum percentage of the total transaction amount that can be deducted from the user's wallet.
                    </p>
                  </div>

                  <Separator />

                  <div className="bg-muted/30 rounded-xl p-4 border border-border/50 text-sm space-y-2">
                    <h3 className="font-semibold text-neutral-800 flex items-center gap-1.5">
                      <Shield className="size-4 text-primary" />
                      Usage Illustration
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      If set to <strong className="text-neutral-800 font-bold">{percentage}%</strong>:
                    </p>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1 mt-1">
                      <li>
                        For a transaction total of <strong>$10.00</strong>: the user can pay a maximum of{' '}
                        <strong>${((10 * percentage) / 100).toFixed(2)}</strong> from their wallet balance.
                      </li>
                      <li>
                        The remaining{' '}
                        <strong>${((10 * (100 - percentage)) / 100).toFixed(2)}</strong> must be paid via Razorpay (card/UPI).
                      </li>
                      {percentage === 100 ? (
                        <li>Recharges can be paid 100% using wallet balance (fully bypassing credit card gateway).</li>
                      ) : percentage === 0 ? (
                        <li>Wallet balance usage is disabled. All transactions require card checkout.</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
            {isSuperAdmin && (
              <CardFooter className="border-t border-border/40 pt-4 flex justify-end">
                <Button type="submit" disabled={saving || loading}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 size-4" />
                      Save Settings
                    </>
                  )}
                </Button>
              </CardFooter>
            )}
          </form>
        </Card>

        {!isSuperAdmin && (
          <Card className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 h-fit">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
                <Shield className="size-4 text-amber-700" />
                Permissions Required
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-xs text-amber-900/80 leading-relaxed">
              Only Super Administrators have permission to modify wallet usage restrictions and maximum consumption limits.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
