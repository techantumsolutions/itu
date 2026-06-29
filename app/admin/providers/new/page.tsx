'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import { toast } from 'sonner'
import type { User } from '@/lib/types'
import { isClientAdminUser } from '@/lib/tickets/auth-headers'
import { clientHasAdminPermission } from '@/lib/auth/client-features'

function adminHeaders(user: User) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': user.id,
    'x-user-email': user.email,
    'x-user-name': user.name ?? 'Admin',
    'x-user-role': user.role,
  }
}

export default function AdminAddProviderPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [submitting, setSubmitting] = useState(false)

  const [addName, setAddName] = useState('')
  const [addCode, setAddCode] = useState('')
  const [addAdapter, setAddAdapter] = useState('dtone')
  const [addBaseUrl, setAddBaseUrl] = useState('')
  const [addPriority, setAddPriority] = useState('0')
  const [addCountries, setAddCountries] = useState('')
  const [addApiKey, setAddApiKey] = useState('')
  const [addApiSecret, setAddApiSecret] = useState('')
  const [addClientId, setAddClientId] = useState('')
  const [addClientSecret, setAddClientSecret] = useState('')

  const [providers, setProviders] = useState<{ priority: number }[]>([])

  useEffect(() => {
    if (!user) return
    if (!isClientAdminUser(user)) {
      toast.error('Admins only')
      router.replace('/account')
      return
    }
    if (!clientHasAdminPermission(user, 'providers.create')) {
      toast.error('You do not have permission to add providers')
      router.replace('/admin/providers')
      return
    }
    const h = adminHeaders(user)
    fetch('/api/admin/lcr/providers', { credentials: 'include', headers: h, cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.providers)) {
          setProviders(data.providers)
        }
      })
      .catch(() => {})
  }, [user, router])

  const priorityOptions = useMemo(() => {
    const takenByOthers = new Set(providers.filter((p) => p.priority > 0).map((p) => p.priority))
    const activeSlots = providers.filter((p) => p.priority > 0).length
    const total = activeSlots + 1
    const numbered = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !takenByOthers.has(n))
    return [0, ...numbered]
  }, [providers])

  const handleSubmit = async () => {
    if (!user || !isClientAdminUser(user)) return
    if (!clientHasAdminPermission(user, 'providers.create')) return
    const code = addCode.trim().toUpperCase()
    const name = addName.trim()
    if (!code || !name) {
      toast.error('Name and code are required')
      return
    }
    const cred: Record<string, string> = {}
    if (addApiKey.trim()) cred.apiKey = addApiKey.trim()
    if (addApiSecret.trim()) cred.apiSecret = addApiSecret.trim()
    if (addClientId.trim()) cred.clientId = addClientId.trim()
    if (addClientSecret.trim()) cred.clientSecret = addClientSecret.trim()

    const h = adminHeaders(user)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/lcr/providers', {
        method: 'POST',
        credentials: 'include',
        headers: h,
        body: JSON.stringify({
          code,
          name,
          adapterKey: addAdapter,
          baseUrl: addBaseUrl.trim() || undefined,
          priority: Number(addPriority) || 0,
          supportedCountries: addCountries
            .split(/[\s,]+/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          credentials: Object.keys(cred).length ? cred : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Create failed')
      const created = data.provider as { id?: string } | null
      if (created?.id) {
        const syncRes = await fetch('/api/admin/lcr/sync', {
          method: 'POST',
          credentials: 'include',
          headers: h,
          body: JSON.stringify({ providerId: created.id }),
        })
        const syncData = await syncRes.json().catch(() => ({}))
        if (!syncRes.ok) toast.error(syncData.error ?? 'Saved provider but catalog sync failed')
        else toast.success(`Provider saved and catalog synced (${syncData.result?.fetchedRaw ?? 0} raw rows)`)
      } else {
        toast.success('Provider saved')
      }
      router.push('/admin/providers')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user || !isClientAdminUser(user) || !clientHasAdminPermission(user, 'providers.create')) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Checking access…
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-12">
      <div className="mx-auto max-w-2xl space-y-6 px-4 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="gap-1">
            <Link href="/admin/providers">
              <ArrowLeft className="h-4 w-4" />
              Back to providers
            </Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Add provider</h1>
          <p className="text-muted-foreground text-sm">
            Admins only. Creates an LCR provider row and runs catalog ingestion.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Provider details</CardTitle>
            <CardDescription>All fields scroll with the page on smaller viewports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-2">
              <Label htmlFor="name">Provider name</Label>
              <Input id="name" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. DT One" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="code">Provider code</Label>
              <Input id="code" value={addCode} onChange={(e) => setAddCode(e.target.value)} placeholder="e.g. DTONE" />
            </div>
            <div className="grid gap-2">
              <Label>Adapter</Label>
              <Select value={addAdapter} onValueChange={setAddAdapter}>
                <SelectTrigger id="adapter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dtone">DT One (dtone)</SelectItem>
                  <SelectItem value="ding">Ding (ding)</SelectItem>
                  <SelectItem value="reloadly">Reloadly (reloadly)</SelectItem>
                  <SelectItem value="valuetopup">Value Topup (valuetopup)</SelectItem>
                  <SelectItem value="custom">Custom (custom)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apiUrl">API base URL (optional)</Label>
              <Input
                id="apiUrl"
                value={addBaseUrl}
                onChange={(e) => setAddBaseUrl(e.target.value)}
                placeholder="Overrides env default when set"
              />
            </div>
            <div className="grid gap-2">
              <Label>Priority (lower = preferred)</Label>
              <Select value={addPriority} onValueChange={setAddPriority}>
                <SelectTrigger id="priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {String(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="countries">Supported countries (ISO2/3, comma-separated)</Label>
              <Input
                id="countries"
                value={addCountries}
                onChange={(e) => setAddCountries(e.target.value)}
                placeholder="IND, USA or IN, US"
              />
            </div>

            <div className="border-t pt-6 space-y-4">
              <h3 className="text-sm font-medium">API credentials</h3>
              <p className="text-xs text-muted-foreground">
                Optional if the adapter reads from environment variables. Value Topup uses API key + HMAC secret
                (VALUE_TOPUP_API_KEY, VALUE_TOPUP_HMAC_SECRET).
              </p>
              <div className="grid gap-2">
                <Label htmlFor="apiKey">API key / username</Label>
                <Input
                  id="apiKey"
                  type="password"
                  autoComplete="off"
                  value={addApiKey}
                  onChange={(e) => setAddApiKey(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="apiSecret">API secret / password</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  autoComplete="off"
                  value={addApiSecret}
                  onChange={(e) => setAddApiSecret(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="clientId">Client ID (OAuth)</Label>
                  <Input
                    id="clientId"
                    type="password"
                    autoComplete="off"
                    value={addClientId}
                    onChange={(e) => setAddClientId(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="clientSecret">Client secret</Label>
                  <Input
                    id="clientSecret"
                    type="password"
                    autoComplete="off"
                    value={addClientSecret}
                    onChange={(e) => setAddClientSecret(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-4">
              <Button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
                {submitting ? 'Saving…' : 'Save & sync'}
              </Button>
              <Button type="button" variant="outline" asChild disabled={submitting}>
                <Link href="/admin/providers">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
