'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { 
  Plus, Trash2, Edit2, Save, ArrowLeft, RefreshCw, 
  Coins, Gift, History, DollarSign, Loader2, Check, X 
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface RewardRule {
  id: string
  name: string
  trigger: 'FIRST_RECHARGE' | 'MIN_AMOUNT' | 'RECHARGE_COUNT'
  points: number
  scope: {
    min_amount?: number
    recharge_count?: number
  }
  is_active: boolean
  created_at: string
}

interface UserAccount {
  points_balance: number
  updated_at: string
  profiles: {
    email: string
    name: string
  }
}

interface LedgerLog {
  id: string
  points: number
  reason: string
  created_at: string
  profiles: {
    email: string
    name: string
  }
}

export default function RewardsManagementPage() {
  const [activeTab, setActiveTab] = useState('rules')
  const [rules, setRules] = useState<RewardRule[]>([])
  const [accounts, setAccounts] = useState<UserAccount[]>([])
  const [ledger, setLedger] = useState<LedgerLog[]>([])
  const [usdValue, setUsdValue] = useState(0.01)
  const [maxRedemptionPercentage, setMaxRedemptionPercentage] = useState(50)
  const [isSuperAdmin, setIsSuperAdmin] = useState(true) // will check via profile check or default

  // Loading States
  const [loadingRules, setLoadingRules] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingLedger, setLoadingLedger] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingRule, setSavingRule] = useState(false)

  // Rule Form States
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [ruleTrigger, setRuleTrigger] = useState<'FIRST_RECHARGE' | 'MIN_AMOUNT' | 'RECHARGE_COUNT'>('FIRST_RECHARGE')
  const [rulePoints, setRulePoints] = useState(100)
  const [minAmount, setMinAmount] = useState(10)
  const [rechargeCount, setRechargeCount] = useState(3)
  const [ruleActive, setRuleActive] = useState(true)

  // Fetch functions
  const fetchRules = async () => {
    setLoadingRules(true)
    try {
      const res = await fetch('/api/admin/rewards/rules')
      if (res.ok) {
        const body = await res.json()
        setRules(body.rules || [])
      } else {
        toast.error('Failed to load reward rules')
      }
    } catch {
      toast.error('Failed to load reward rules')
    } finally {
      setLoadingRules(false)
    }
  }

  const fetchAccounts = async () => {
    setLoadingAccounts(true)
    try {
      const res = await fetch('/api/admin/rewards/accounts')
      if (res.ok) {
        const body = await res.json()
        setAccounts(body.accounts || [])
      } else {
        toast.error('Failed to load user balances')
      }
    } catch {
      toast.error('Failed to load user balances')
    } finally {
      setLoadingAccounts(false)
    }
  }

  const fetchLedger = async () => {
    setLoadingLedger(true)
    try {
      const res = await fetch('/api/admin/rewards/ledger')
      if (res.ok) {
        const body = await res.json()
        setLedger(body.logs || [])
      } else {
        toast.error('Failed to load rewards ledger')
      }
    } catch {
      toast.error('Failed to load rewards ledger')
    } finally {
      setLoadingLedger(false)
    }
  }

  const fetchSettings = async () => {
    setLoadingSettings(true)
    try {
      const res = await fetch('/api/admin/rewards/settings')
      if (res.ok) {
        const body = await res.json()
        setUsdValue(body.usdValue ?? 0.01)
        setMaxRedemptionPercentage(body.maxRedemptionPercentage ?? 50)
      }
    } catch {
      // ignore
    } finally {
      setLoadingSettings(false)
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
      // default to true to let forms try (server will reject if unauthorized)
    }
  }

  useEffect(() => {
    void checkUserRole()
    void fetchRules()
  }, [])

  useEffect(() => {
    if (activeTab === 'rules') {
      void fetchRules()
    } else if (activeTab === 'balances') {
      void fetchAccounts()
    } else if (activeTab === 'ledger') {
      void fetchLedger()
    } else if (activeTab === 'settings') {
      void fetchSettings()
    }
  }, [activeTab])

  // Save Settings
  const handleSaveSettings = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super administrators can modify rewards settings.')
      return
    }
    setSavingSettings(true)
    try {
      const res = await fetch('/api/admin/rewards/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usdValue, maxRedemptionPercentage }),
      })
      if (res.ok) {
        toast.success('Point settings updated successfully')
      } else {
        const body = await res.json()
        toast.error(body.error || 'Failed to update settings')
      }
    } catch {
      toast.error('Failed to update settings')
    } finally {
      setSavingSettings(false)
    }
  }

  // Create / Update Rule
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ruleName.trim()) {
      toast.error('Rule name is required')
      return
    }
    if (rulePoints <= 0) {
      toast.error('Points must be greater than 0')
      return
    }

    setSavingRule(true)
    const scope: Record<string, any> = {}
    if (ruleTrigger === 'MIN_AMOUNT') {
      scope.min_amount = minAmount
    } else if (ruleTrigger === 'RECHARGE_COUNT') {
      scope.recharge_count = rechargeCount
    }

    const payload = {
      name: ruleName.trim(),
      trigger: ruleTrigger,
      points: Number(rulePoints),
      scope,
      is_active: ruleActive,
    }

    try {
      const url = editingRuleId ? `/api/admin/rewards/rules/${editingRuleId}` : '/api/admin/rewards/rules'
      const method = editingRuleId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success(editingRuleId ? 'Rule updated successfully' : 'Rule created successfully')
        resetRuleForm()
        void fetchRules()
      } else {
        const body = await res.json()
        toast.error(body.error || 'Failed to save rule')
      }
    } catch {
      toast.error('Failed to save rule')
    } finally {
      setSavingRule(false)
    }
  }

  // Delete Rule
  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reward rule?')) return
    try {
      const res = await fetch(`/api/admin/rewards/rules/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Rule deleted successfully')
        void fetchRules()
      } else {
        const body = await res.json()
        toast.error(body.error || 'Failed to delete rule')
      }
    } catch {
      toast.error('Failed to delete rule')
    }
  }

  // Edit Rule Setup
  const handleEditRule = (rule: RewardRule) => {
    setEditingRuleId(rule.id)
    setRuleName(rule.name)
    setRuleTrigger(rule.trigger)
    setRulePoints(rule.points)
    setRuleActive(rule.is_active)
    if (rule.trigger === 'MIN_AMOUNT') {
      setMinAmount(rule.scope?.min_amount ?? 10)
    } else if (rule.trigger === 'RECHARGE_COUNT') {
      setRechargeCount(rule.scope?.recharge_count ?? 3)
    }
  }

  const resetRuleForm = () => {
    setEditingRuleId(null)
    setRuleName('')
    setRuleTrigger('FIRST_RECHARGE')
    setRulePoints(100)
    setMinAmount(10)
    setRechargeCount(3)
    setRuleActive(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rewards & Loyalty Manager</h1>
          <Link href="/admin/settings?tab=system" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="size-3.5" />
            Back to settings
          </Link>
          <p className="mt-1 text-muted-foreground">Manage user reward points, campaign rules, valuation rates, and transaction ledger logs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => {
            if (activeTab === 'rules') void fetchRules()
            else if (activeTab === 'balances') void fetchAccounts()
            else if (activeTab === 'ledger') void fetchLedger()
            else if (activeTab === 'settings') void fetchSettings()
          }}>
            <RefreshCw className="mr-2 size-4" />
            Refresh Data
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="rules" className="gap-2">
            <Gift className="size-4" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="balances" className="gap-2">
            <Coins className="size-4" />
            User Balances
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2">
            <History className="size-4" />
            Ledger
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <DollarSign className="size-4" />
            Point Settings
          </TabsTrigger>
        </TabsList>

        {/* Tab Content - Rules */}
        <TabsContent value="rules" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            {/* Rules List */}
            <Card className="rounded-2xl border border-border/70 bg-card shadow-elevated-sm">
              <CardHeader>
                <CardTitle>Active Campaigns</CardTitle>
                <CardDescription>Reward structures evaluated when a customer completes a recharge order.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loadingRules ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="size-8 animate-spin mr-2" />
                    Loading rules...
                  </div>
                ) : rules.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground text-sm">No campaigns defined yet. Use the editor to add your first rule.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule Details</TableHead>
                        <TableHead>Trigger Type</TableHead>
                        <TableHead>Points Gained</TableHead>
                        <TableHead>Status</TableHead>
                        {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">
                            <div>
                              <p className="font-semibold text-neutral-800">{rule.name}</p>
                              {rule.trigger === 'MIN_AMOUNT' && (
                                <p className="text-xs text-muted-foreground">Min Threshold: ${rule.scope?.min_amount?.toFixed(2)} USD</p>
                              )}
                              {rule.trigger === 'RECHARGE_COUNT' && (
                                <p className="text-xs text-muted-foreground">Recharge multiple: Every {rule.scope?.recharge_count} successful orders</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {rule.trigger}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold text-primary">+{rule.points} pts</TableCell>
                          <TableCell>
                            {rule.is_active ? (
                              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20 flex w-fit items-center gap-1">
                                <Check className="size-3" /> Active
                              </Badge>
                            ) : (
                              <Badge className="bg-neutral-50 text-neutral-700 ring-neutral-600/20 flex w-fit items-center gap-1">
                                <X className="size-3" /> Inactive
                              </Badge>
                            )}
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleEditRule(rule)}>
                                  <Edit2 className="size-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteRule(rule.id)}>
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Rule Form Editor */}
            {isSuperAdmin ? (
              <Card className="rounded-2xl border border-border/70 bg-card shadow-elevated-sm h-fit">
                <form onSubmit={handleSaveRule}>
                  <CardHeader>
                    <CardTitle>{editingRuleId ? 'Edit Campaign Rule' : 'New Campaign Rule'}</CardTitle>
                    <CardDescription>Define loyalty rewards multipliers for active user recharge events.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Campaign Name</Label>
                      <Input
                        id="name"
                        value={ruleName}
                        onChange={(e) => setRuleName(e.target.value)}
                        placeholder="e.g., Summer Points Booster"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="trigger">Trigger Event Type</Label>
                      <Select value={ruleTrigger} onValueChange={(v) => setRuleTrigger(v as any)}>
                        <SelectTrigger id="trigger">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIRST_RECHARGE">First Recharge Event</SelectItem>
                          <SelectItem value="MIN_AMOUNT">Minimum Recharge Value Threshold</SelectItem>
                          <SelectItem value="RECHARGE_COUNT">Recharge Count Multiple Loyalty</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="points">Award Points (Coins)</Label>
                      <Input
                        id="points"
                        type="number"
                        min="1"
                        value={rulePoints}
                        onChange={(e) => setRulePoints(Number(e.target.value))}
                        required
                      />
                    </div>

                    {ruleTrigger === 'MIN_AMOUNT' && (
                      <div className="space-y-2">
                        <Label htmlFor="minAmount">Minimum Recharge Amount (USD)</Label>
                        <Input
                          id="minAmount"
                          type="number"
                          min="1"
                          step="any"
                          value={minAmount}
                          onChange={(e) => setMinAmount(Number(e.target.value))}
                          required
                        />
                      </div>
                    )}

                    {ruleTrigger === 'RECHARGE_COUNT' && (
                      <div className="space-y-2">
                        <Label htmlFor="rechargeCount">Recharge Count Frequency (N)</Label>
                        <Input
                          id="rechargeCount"
                          type="number"
                          min="1"
                          value={rechargeCount}
                          onChange={(e) => setRechargeCount(Number(e.target.value))}
                          required
                        />
                        <p className="text-xs text-muted-foreground">Awards points after every N successful recharges (e.g. 3rd, 6th, 9th orders...)</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <Label htmlFor="active" className="cursor-pointer">Enable Campaign Rule</Label>
                      <Switch id="active" checked={ruleActive} onCheckedChange={setRuleActive} />
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between border-t border-border/40 pt-4">
                    {editingRuleId ? (
                      <Button type="button" variant="outline" onClick={resetRuleForm}>Cancel</Button>
                    ) : (
                      <div />
                    )}
                    <Button type="submit" disabled={savingRule}>
                      {savingRule ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 size-4" />
                          {editingRuleId ? 'Save Changes' : 'Create Rule'}
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            ) : (
              <Card className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-amber-900">Permissions Required</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-amber-900/80 leading-relaxed">
                  Only Super Administrators have access to make changes, create, edit, or delete reward point rules.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab Content - User Balances */}
        <TabsContent value="balances">
          <Card className="rounded-2xl border border-border/70 bg-card shadow-elevated-sm">
            <CardHeader>
              <CardTitle>User Reward Accounts</CardTitle>
              <CardDescription>Durable points balances currently accumulated by registered customer profiles.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAccounts ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin mr-2" />
                  Loading accounts...
                </div>
              ) : accounts.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground text-sm">No reward accounts found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer Email</TableHead>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Points Balance</TableHead>
                      <TableHead>Equivalent Value</TableHead>
                      <TableHead>Last Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm">{account.profiles?.email || '—'}</TableCell>
                        <TableCell>{account.profiles?.name || '—'}</TableCell>
                        <TableCell className="font-bold text-primary">{account.points_balance.toLocaleString()} pts</TableCell>
                        <TableCell className="font-medium text-neutral-800">${(account.points_balance * usdValue).toFixed(2)} USD</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(account.updated_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content - Ledger */}
        <TabsContent value="ledger">
          <Card className="rounded-2xl border border-border/70 bg-card shadow-elevated-sm">
            <CardHeader>
              <CardTitle>Reward Ledger Activity Logs</CardTitle>
              <CardDescription>Historical audit log of points added to user accounts, linked to successful transaction events.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLedger ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin mr-2" />
                  Loading ledger logs...
                </div>
              ) : ledger.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground text-sm">No ledger logs found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Reward Reason</TableHead>
                      <TableHead>Points Awarded</TableHead>
                      <TableHead>Ledger ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{log.profiles?.name || '—'}</p>
                            <p className="font-mono text-xs text-muted-foreground">{log.profiles?.email || '—'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-neutral-800">{log.reason}</TableCell>
                        <TableCell className="font-bold text-primary">+{log.points} pts</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{log.id.slice(0, 8)}...</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content - Settings */}
        <TabsContent value="settings">
          <Card className="rounded-2xl border border-border/70 bg-card shadow-elevated-sm max-w-xl">
            <CardHeader>
              <CardTitle>Reward Point Valuation Settings</CardTitle>
              <CardDescription>Configure the monetary conversion rate of reward points for this application.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingSettings ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin mr-2" />
                  Loading point settings...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="usdValue">Valuation rate (1 Point = X USD)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
                      <Input
                        id="usdValue"
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={usdValue}
                        onChange={(e) => setUsdValue(Number(e.target.value))}
                        disabled={!isSuperAdmin}
                        className="pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">By default, 1 point is valued at $0.01 USD (1 cent). Changing this updates value conversion displays.</p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="percentage">Maximum Reward Points Redemption Percentage</Label>
                    <div className="flex items-center gap-4">
                      <input
                        id="percentage-range"
                        type="range"
                        min="0"
                        max="100"
                        value={maxRedemptionPercentage}
                        onChange={(e) => setMaxRedemptionPercentage(Number(e.target.value))}
                        disabled={!isSuperAdmin}
                        className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="relative w-24 flex items-center">
                        <Input
                          id="percentage"
                          type="number"
                          min="0"
                          max="100"
                          value={maxRedemptionPercentage}
                          onChange={(e) => setMaxRedemptionPercentage(Math.min(100, Math.max(0, Number(e.target.value))))}
                          disabled={!isSuperAdmin}
                          className="pr-6 font-semibold"
                        />
                        <span className="absolute right-3 font-semibold text-neutral-500">%</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Specifies the maximum percentage of the user's total reward points balance that can be redeemed in a single transaction.
                    </p>
                  </div>

                  <Separator />

                  <div className="bg-muted/30 rounded-xl p-4 border border-border/50 text-sm space-y-2">
                    <h3 className="font-semibold text-neutral-800 flex items-center gap-1">
                      <Coins className="size-4 text-primary" />
                      Example Conversion Scales
                    </h3>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground mt-1">
                      <li>100 Points = ${(100 * usdValue).toFixed(2)} USD</li>
                      <li>1,000 Points = ${(1000 * usdValue).toFixed(2)} USD</li>
                      <li>5,000 Points = ${(5000 * usdValue).toFixed(2)} USD</li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
            {isSuperAdmin && (
              <CardFooter className="border-t border-border/40 pt-4 flex justify-end">
                <Button onClick={handleSaveSettings} disabled={savingSettings || loadingSettings}>
                  {savingSettings ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 size-4" />
                      Save valuation
                    </>
                  )}
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
