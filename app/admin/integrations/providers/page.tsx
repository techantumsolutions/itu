'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { IntegrationDataPage, IntegrationRowActions } from '@/app/admin/integrations/_components/integration-data-page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, CheckCircle2, XCircle, AlertCircle, Loader2, GitFork } from 'lucide-react'
import { toast } from 'sonner'

type StepStatus = 'idle' | 'running' | 'success' | 'failed'

interface PipelineStep {
  key: string
  label: string
  description: string
  status: StepStatus
  message: string
}

const INITIAL_STEPS: PipelineStep[] = [
  {
    key: 'step1_check',
    label: 'Step 1: Connection Check',
    description: 'Verify adapter connection status and loaded credentials.',
    status: 'idle',
    message: '',
  },
  {
    key: 'step2_fetch',
    label: 'Step 2: API Fetch & Raw Store',
    description: 'Fetch operator/plan API payloads and store entirely raw in DB.',
    status: 'idle',
    message: '',
  },
  {
    key: 'step3_countries',
    label: 'Step 3: Staging Normalize',
    description: 'Normalize operators by country ISO3 into agg_operators and agg_plans.',
    status: 'idle',
    message: '',
  },
  {
    key: 'step4_normalize',
    label: 'Step 4: Registry Domain Filter',
    description: 'Activate operators found in domain_operator_registry; inactivate others and sync plan status.',
    status: 'idle',
    message: '',
  },
  {
    key: 'step4_apply_merge_history',
    label: 'Step 4b: Apply Merge History',
    description: 'Reuse prior admin operator merge decisions to canonicalize staging operators before name cleanup.',
    status: 'idle',
    message: '',
  },
  {
    key: 'step5_filter_telecom',
    label: 'Step 5: Strip Country Affixes',
    description: 'Remove country name, ISO2, and ISO3 prefix/suffix from active operator names.',
    status: 'idle',
    message: '',
  },
  {
    key: 'step6_merge',
    label: 'Step 6: Merge Duplicate Operators',
    description: 'Merge same-name active operators in each country and reassign their plans.',
    status: 'idle',
    message: '',
  },
  {
    key: 'step7_promote',
    label: 'Step 7: Filter 3 (Promote to Live Catalog)',
    description: 'Inactivate empty operators. Promote remaining active items to system tables.',
    status: 'idle',
    message: '',
  },
  {
    key: 'step8_filter_benefits',
    label: 'Step 8: Plan Benefit Filtering',
    description: 'Clean promoted system_plans that do not contain mobile/data benefits.',
    status: 'idle',
    message: '',
  },
]

export default function IntegrationProvidersPage() {
  const [providers, setProviders] = useState<any[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS)
  const [refreshKey, setRefreshKey] = useState<number>(0)

  // Load providers list for dropdown selection
  useEffect(() => {
    fetch('/api/admin/aggregator/providers')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.providers)) {
          const active = data.providers.filter((p: any) => p.is_active)
          setProviders(active)
          if (active.length > 0) {
            setSelectedProviderId(active[0].id)
          }
        }
      })
      .catch(() => {})
  }, [])

  const runStep = async (stepKey: string) => {
    if (!selectedProviderId) {
      toast.error('Please select a provider first.')
      return
    }

    setSteps((prev) =>
      prev.map((s) => (s.key === stepKey ? { ...s, status: 'running', message: 'Executing step...' } : s))
    )

    try {
      const res = await fetch('/api/admin/aggregator/sync-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: stepKey,
          providerId: selectedProviderId,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute step')
      }

      setSteps((prev) =>
        prev.map((s) =>
          s.key === stepKey
            ? { ...s, status: data.success ? 'success' : 'failed', message: data.message || 'Done' }
            : s
        )
      )
      toast.success('Step executed successfully.')
      setRefreshKey((k) => k + 1) // Refresh table data after any promote action
    } catch (err: any) {
      setSteps((prev) =>
        prev.map((s) => (s.key === stepKey ? { ...s, status: 'failed', message: err.message || 'Error' } : s))
      )
      toast.error(err.message || 'Step execution failed.')
    }
  }

  const resetPipeline = () => {
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'idle', message: '' })))
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm bg-gradient-to-br from-zinc-900/50 to-zinc-950/80">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <GitFork className="size-5 text-primary" />
            Manual Staging Pipeline Controller
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Control the integration ingestion engine step-by-step. Select a provider below and run stages.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1.5 w-[240px]">
              <span className="text-xs font-semibold text-zinc-400">Active Ingestion Provider</span>
              <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger className="bg-background border-border/80">
                  <SelectValue placeholder="Select Ingestion Provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="mt-5" onClick={resetPipeline}>
              Reset Timeline
            </Button>
          </div>

          {/* Responsive Step Ingestion Pipeline Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {steps.map((step, idx) => (
              <div
                key={step.key}
                className={`flex flex-col justify-between p-4 rounded-lg border transition-all duration-200 ${
                  step.status === 'running'
                    ? 'border-primary/60 bg-primary/5 shadow-md shadow-primary/5'
                    : step.status === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : step.status === 'failed'
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-border/60 bg-background/50'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">STAGE {idx + 1}</span>
                    {step.status === 'running' && <Loader2 className="size-4 animate-spin text-primary" />}
                    {step.status === 'success' && <CheckCircle2 className="size-4 text-emerald-500" />}
                    {step.status === 'failed' && <XCircle className="size-4 text-red-500" />}
                    {step.status === 'idle' && <AlertCircle className="size-4 text-zinc-500" />}
                  </div>
                  <h4 className="font-semibold text-sm leading-tight">{step.label}</h4>
                  <p className="text-xs text-muted-foreground leading-normal">{step.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/30 flex flex-col gap-2">
                  {step.message && (
                    <div className="text-[10px] font-mono leading-tight max-h-[48px] overflow-y-auto break-words bg-zinc-950/40 p-1.5 rounded border border-border/30">
                      {step.message}
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="w-full text-xs font-semibold"
                    variant={step.status === 'success' ? 'secondary' : 'default'}
                    disabled={step.status === 'running' || !selectedProviderId}
                    onClick={() => void runStep(step.key)}
                  >
                    <Play className="mr-1.5 size-3" />
                    {step.status === 'success' ? 'Run Again' : 'Run Stage'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <IntegrationDataPage
        key={refreshKey}
        title="Service Providers"
        description="External aggregators with priority, status, and sync metadata."
        endpoint="/api/admin/aggregator/providers"
        collectionKey="providers"
        filters={{ searchPlaceholder: 'Search provider, code, adapter…', hideCountry: true }}
        columns={[
          { key: 'name', label: 'Provider', secondaryKey: 'code' },
          { key: 'adapter_key', label: 'Adapter', secondaryKey: 'priority' },
          { key: 'status', label: 'Status', badge: true },
          { key: 'last_success_sync_at', label: 'Last sync', datetime: true },
        ]}
        renderRowActions={(row, { syncProvider, syncingId }) => {
          const id = String(row.id ?? '')
          return (
            <IntegrationRowActions>
              <Button
                size="sm"
                variant="outline"
                disabled={!id || syncingId === id}
                onClick={() => void syncProvider(id)}
              >
                {syncingId === id ? '…' : 'Sync'}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/admin/providers">Manage</Link>
              </Button>
            </IntegrationRowActions>
          )
        }}
      />
    </div>
  )
}
