import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type RechargeAttemptRow = {
  id: string
  idempotency_key: string | null
  distributor_ref: string
  internal_plan_id: string
  phone_number: string
  send_amount: number | null
  currency: string | null
  status: string
  routing_decision: unknown
  attempts: unknown
  selected_provider_id: string | null
  selected_provider_plan_id: string | null
  provider_adapter: string | null
  provider_ref: string | null
  provider_response: unknown
  error: string | null
  created_at: string
  updated_at: string
}

export async function dbFindRechargeByIdempotencyKey(key: string): Promise<RechargeAttemptRow | null> {
  const res = await supabaseRest(`lcr_v2_recharge_attempts?idempotency_key=eq.${enc(key)}&limit=1`, { cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as RechargeAttemptRow[]
  return rows?.[0] ?? null
}

export async function dbFindRechargeByDistributorRef(ref: string): Promise<RechargeAttemptRow | null> {
  const res = await supabaseRest(`lcr_v2_recharge_attempts?distributor_ref=eq.${enc(ref)}&limit=1`, { cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as RechargeAttemptRow[]
  return rows?.[0] ?? null
}

export async function dbFindRechargeById(id: string): Promise<RechargeAttemptRow | null> {
  const res = await supabaseRest(`lcr_v2_recharge_attempts?id=eq.${enc(id)}&limit=1`, { cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as RechargeAttemptRow[]
  return rows?.[0] ?? null
}

export async function dbInsertRechargeAttempt(input: {
  idempotencyKey?: string | null
  distributorRef: string
  internalPlanId: string
  phoneNumber: string
  sendAmount?: number | null
  currency?: string | null
  routingDecision: unknown
}): Promise<RechargeAttemptRow> {
  const res = await supabaseRest('lcr_v2_recharge_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey ?? null,
      distributor_ref: input.distributorRef,
      internal_plan_id: input.internalPlanId,
      phone_number: input.phoneNumber,
      send_amount: input.sendAmount ?? null,
      currency: input.currency ?? null,
      status: 'processing',
      routing_decision: input.routingDecision ?? {},
      attempts: [],
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as RechargeAttemptRow[]
  if (!rows?.[0]) throw new Error('insert_recharge_failed')
  return rows[0]
}

export async function dbUpdateRechargeAttempt(
  id: string,
  patch: Partial<{
    status: string
    attempts: unknown
    selected_provider_id: string | null
    selected_provider_plan_id: string | null
    provider_adapter: string | null
    provider_ref: string | null
    provider_response: unknown
    error: string | null
  }>
) {
  const res = await supabaseRest(`lcr_v2_recharge_attempts?id=eq.${enc(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbFindMappingsByProviderPlanId(providerPlanId: string): Promise<
  Array<{ internal_plan_id: string; provider_id: string; provider_plan_id: string }>
> {
  const res = await supabaseRest(
    `internal_plan_provider_mapping?provider_plan_id=eq.${enc(providerPlanId)}&enabled=eq.true&select=internal_plan_id,provider_id,provider_plan_id`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as Array<{ internal_plan_id: string; provider_id: string; provider_plan_id: string }>
}

export async function dbGetInternalPlan(id: string) {
  const res = await supabaseRest(`internal_plans?id=eq.${enc(id)}&limit=1`, { cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as any[]
  return rows?.[0] ?? null
}

export async function dbGetProvider(id: string) {
  const res = await supabaseRest(`lcr_providers?id=eq.${enc(id)}&limit=1`, { cache: 'no-store' })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as any[]
  return rows?.[0] ?? null
}

export async function dbListActiveProviders() {
  const res = await supabaseRest('lcr_providers?is_active=eq.true&select=id,code,adapter_key&order=priority.asc', {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as Array<{ id: string; code: string; adapter_key: string }>
}
