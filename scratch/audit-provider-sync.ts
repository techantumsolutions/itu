/**
 * Provider Sync Pipeline Audit
 * Usage: npx tsx scratch/audit-provider-sync.ts
 */
import { loadEnvConfig } from '@next/env'
import { supabaseRest } from '../lib/db/supabase-rest'

loadEnvConfig(process.cwd())

type Issue = { severity: 'error' | 'warn' | 'info'; category: string; detail: string; count?: number }

const issues: Issue[] = []

async function q<T>(path: string): Promise<T[]> {
  const res = await supabaseRest(path, { cache: 'no-store' })
  if (!res.ok) {
    issues.push({ severity: 'error', category: 'query', detail: `Failed: ${path} — ${await res.text()}` })
    return []
  }
  return (await res.json()) as T[]
}

async function main() {
  const started = Date.now()
  console.log('=== Provider Sync Pipeline Audit ===\n')

  const providers = await q<{ id: string; code: string; name: string; is_active: boolean }>(
    'lcr_providers?select=id,code,name,is_active&is_active=eq.true',
  )
  console.log(`Active providers: ${providers.length}`)

  // Duplicate plan_mappings (same provider + provider_plan_id)
  const mappings = await q<{
    id: string
    service_provider_id: string
    provider_plan_id: string
    system_plan_id: string
    provider_plan_raw_id: string | null
  }>('plan_mappings?select=id,service_provider_id,provider_plan_id,system_plan_id,provider_plan_raw_id&limit=5000')

  const pmKey = new Map<string, string[]>()
  for (const m of mappings) {
    const pid = String(m.provider_plan_id ?? '').trim()
    if (!pid) {
      issues.push({ severity: 'error', category: 'missing_mappings', detail: `plan_mapping ${m.id} missing provider_plan_id` })
      continue
    }
    const key = `${m.service_provider_id}:${pid}`
    const arr = pmKey.get(key) ?? []
    arr.push(m.id)
    pmKey.set(key, arr)
  }
  let dupMappings = 0
  for (const [, ids] of pmKey) {
    if (ids.length > 1) dupMappings += ids.length - 1
  }
  if (dupMappings > 0) {
    issues.push({
      severity: 'error',
      category: 'duplicate_records',
      detail: 'Duplicate plan_mappings by (service_provider_id, provider_plan_id)',
      count: dupMappings,
    })
  }

  // Missing provider_plan_raw_id
  const nullRaw = mappings.filter((m) => !m.provider_plan_raw_id).length
  if (nullRaw > 0) {
    issues.push({
      severity: 'warn',
      category: 'missing_mappings',
      detail: 'plan_mappings with NULL provider_plan_raw_id',
      count: nullRaw,
    })
  }

  // Active system_plans without plan_mappings
  const activePlans = await q<{ id: string; status: string }>(
    'system_plans?select=id,status&status=eq.ACTIVE&limit=3000',
  )
  const mappedSystemIds = new Set(mappings.map((m) => m.system_plan_id))
  const unmappedActive = activePlans.filter((p) => !mappedSystemIds.has(p.id)).length
  if (unmappedActive > 0) {
    issues.push({
      severity: 'warn',
      category: 'missing_mappings',
      detail: 'ACTIVE system_plans with no plan_mappings row',
      count: unmappedActive,
    })
  }

  // system_plans missing internal_plan_id
  const sysPlans = await q<{ id: string; internal_plan_id: string | null }>(
    'system_plans?select=id,internal_plan_id&limit=3000',
  )
  const missingInternal = sysPlans.filter((p) => !p.internal_plan_id).length
  if (missingInternal > 0) {
    issues.push({
      severity: 'warn',
      category: 'internal_plans',
      detail: 'system_plans missing internal_plan_id',
      count: missingInternal,
    })
  }

  // Failed sync runs (recent)
  const failedRuns = await q<{ id: string; status: string; error_message: string }>(
    'sync_runs?status=eq.failed&select=id,status,error_message&order=started_at.desc&limit=5',
  )
  if (failedRuns.length > 0) {
    issues.push({
      severity: 'warn',
      category: 'transaction_failures',
      detail: `Recent failed sync_runs: ${failedRuns.map((r) => r.error_message?.slice(0, 60)).join('; ')}`,
      count: failedRuns.length,
    })
  }

  // Latest full-sync logs per provider
  console.log('\n--- Latest sync status per provider ---')
  for (const p of providers) {
    const logs = await q<{ status: string; stage: string; error_message: string | null; finished_at: string; started_at: string }>(
      `sync_logs?service_provider_id=eq.${encodeURIComponent(p.id)}&stage=eq.full-sync&select=status,stage,error_message,finished_at,started_at&order=started_at.desc&limit=1`,
    )
    const last = logs[0]
    console.log(
      `  ${p.code}: ${last?.status ?? 'never'} ${last?.finished_at?.slice(0, 19) ?? ''} ${last?.error_message ? `— ${last.error_message.slice(0, 50)}` : ''}`,
    )
  }

  // Review queue backlog
  const reviewQueue = await q<{ id: string }>('catalog_review_queue?select=id&status=eq.pending&limit=1000')
  console.log(`\ncatalog_review_queue pending: ${reviewQueue.length}`)

  const classificationAudit = await q<{ id: string }>(
    'plan_classification_audit?select=id&order=created_at.desc&limit=1',
  )
  console.log(`plan_classification_audit rows (sample): ${classificationAudit.length > 0 ? 'present' : 'empty'}`)

  console.log('\n--- Issues ---')
  if (issues.length === 0) {
    console.log('No issues detected in sampled checks.')
  } else {
    for (const i of issues) {
      console.log(`[${i.severity.toUpperCase()}] ${i.category}: ${i.detail}${i.count != null ? ` (${i.count})` : ''}`)
    }
  }

  console.log(`\nAudit completed in ${Date.now() - started}ms`)
  console.log(
    JSON.stringify({
      providers: providers.length,
      planMappingsSampled: mappings.length,
      duplicateMappings: dupMappings,
      nullRawId: nullRaw,
      unmappedActivePlans: unmappedActive,
      missingInternalPlanId: missingInternal,
      issueCount: issues.length,
    }),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
