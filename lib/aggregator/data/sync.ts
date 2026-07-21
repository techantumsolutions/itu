/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { enc, jsonRows } from './shared'

export async function aggStartSyncRun(providerCode: string): Promise<string> {
  const res = await supabaseRest('sync_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      provider_code: providerCode,
      status: 'running',
      started_at: new Date().toISOString(),
    }),
  })
  const rows = await jsonRows(res)
  return rows[0]?.id
}

export async function aggUpdateSyncRun(runId: string, updates: Record<string, any>) {
  await supabaseRest(`sync_runs?id=eq.${enc(runId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }).catch(() => {})
}

/** Mark orphaned RUNNING sync_runs failed when a new sync starts for the same provider. */

export async function aggCloseStaleSyncRuns(providerCode: string, exceptRunId?: string | null) {
  const res = await supabaseRest(
    `sync_runs?provider_code=eq.${enc(providerCode)}&status=eq.running&select=id`,
    { cache: 'no-store' },
  )
  if (!res.ok) return
  const rows = (await res.json().catch(() => [])) as Array<{ id: string }>
  const finishedAt = new Date().toISOString()
  for (const row of rows) {
    if (exceptRunId && row.id === exceptRunId) continue
    await supabaseRest(`sync_runs?id=eq.${enc(row.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'failed',
        finished_at: finishedAt,
        error_message: 'Superseded by new sync run (orphaned RUNNING state)',
      }),
    }).catch(() => {})
  }
}

/** Mark orphaned RUNNING sync_logs failed when a new sync starts for the same provider. */

export async function aggCloseRunningSyncLogsForProvider(
  serviceProviderId: string,
  exceptSyncRunId?: string | null,
) {
  const res = await supabaseRest(
    `sync_logs?service_provider_id=eq.${enc(serviceProviderId)}&status=eq.RUNNING&select=id,metadata`,
    { cache: 'no-store' },
  )
  if (!res.ok) return
  const rows = (await res.json().catch(() => [])) as Array<{
    id: string
    metadata?: { syncRunId?: string }
  }>
  const finishedAt = new Date().toISOString()
  for (const row of rows) {
    if (exceptSyncRunId && row.metadata?.syncRunId === exceptSyncRunId) continue
    await supabaseRest(`sync_logs?id=eq.${enc(row.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'FAILED',
        finished_at: finishedAt,
        error_message: 'Superseded by new sync run (orphaned RUNNING log)',
      }),
    }).catch(() => {})
  }
}
