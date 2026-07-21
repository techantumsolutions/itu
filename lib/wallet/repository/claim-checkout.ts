/**
 * Atomic wallet-checkout fulfillment claim.
 * Only the request that transitions transactions.status
 *   pending_payment → processing
 * may debit the wallet, redeem rewards, or call executeCheckout.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import { dbFindRechargeByDistributorRef } from '@/lib/lcr-v2/recharge-db'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type WalletCheckoutClaimResult =
  | { ok: true; claimed: true }
  | { ok: true; claimed: false; currentStatus: string }
  | { ok: false; error: string; status: number }

export type WalletCheckoutTerminal = {
  transactionStatus: string
  transactionId: string
  rechargeStatus?: string | null
  providerRef?: string | null
  providerName?: string | null
  rechargeOrderId?: string | null
  error?: string | null
}

/**
 * PostgreSQL-safe claim via conditional UPDATE (row lock under PostgREST/Postgres).
 * Exactly one concurrent caller receives claimed:true.
 */
export async function claimWalletCheckoutFulfillment(
  transactionId: string,
): Promise<WalletCheckoutClaimResult> {
  const id = transactionId.trim()
  if (!id) {
    return { ok: false, error: 'transactionId is required', status: 400 }
  }

  const claimRes = await supabaseRest(
    `transactions?id=eq.${enc(id)}&status=eq.pending_payment`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'processing',
        updated_at: new Date().toISOString(),
      }),
    },
  )

  if (!claimRes.ok) {
    const text = await claimRes.text().catch(() => '')
    console.error('[wallet-checkout] claim failed', claimRes.status, text)
    return { ok: false, error: 'Unable to claim checkout for processing', status: 500 }
  }

  const rows = (await claimRes.json().catch(() => [])) as Array<{ id?: string; status?: string }>
  if (rows.length > 0 && String(rows[0]?.status) === 'processing') {
    return { ok: true, claimed: true }
  }

  const curRes = await supabaseRest(
    `transactions?id=eq.${enc(id)}&select=id,status&limit=1`,
    { cache: 'no-store' },
  )
  if (!curRes.ok) {
    return { ok: false, error: 'Unable to load transaction after claim race', status: 500 }
  }
  const curRows = (await curRes.json().catch(() => [])) as Array<{ status?: string }>
  const currentStatus = String(curRows[0]?.status ?? '')
  if (!curRows[0]) {
    return { ok: false, error: 'Transaction not found', status: 404 }
  }

  return { ok: true, claimed: false, currentStatus }
}

/** Release claim so the user can retry after a failed debit (before money moved). */
export async function releaseWalletCheckoutClaim(transactionId: string): Promise<void> {
  await supabaseRest(
    `transactions?id=eq.${enc(transactionId)}&status=eq.processing`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'pending_payment',
        updated_at: new Date().toISOString(),
      }),
    },
  ).catch(() => {})
}

async function loadTerminalSnapshot(transactionId: string): Promise<WalletCheckoutTerminal | null> {
  const txnRes = await supabaseRest(
    `transactions?id=eq.${enc(transactionId)}&select=id,status,metadata&limit=1`,
    { cache: 'no-store' },
  )
  if (!txnRes.ok) return null
  const txnRows = (await txnRes.json().catch(() => [])) as Array<{
    id?: string
    status?: string
    metadata?: Record<string, unknown>
  }>
  const txn = txnRows[0]
  if (!txn?.id) return null

  const status = String(txn.status ?? '')
  const meta = txn.metadata && typeof txn.metadata === 'object' ? txn.metadata : {}

  const attempt = await dbFindRechargeByDistributorRef(transactionId).catch(() => null)
  const orderRes = await supabaseRest(
    `recharge_orders?transaction_id=eq.${enc(transactionId)}&select=id,status,provider,provider_ref&limit=1`,
    { cache: 'no-store' },
  )
  const orderRows = orderRes.ok
    ? ((await orderRes.json().catch(() => [])) as Array<{
        id?: string
        status?: string
        provider?: string | null
        provider_ref?: string | null
      }>)
    : []
  const order = orderRows[0]

  return {
    transactionId: txn.id,
    transactionStatus: status,
    rechargeStatus: attempt?.status ?? order?.status ?? null,
    providerRef:
      (attempt?.provider_ref as string | null | undefined) ??
      order?.provider_ref ??
      (typeof meta.provider_ref === 'string' ? meta.provider_ref : null),
    providerName:
      order?.provider ??
      (typeof meta.provider_name === 'string' ? meta.provider_name : null),
    rechargeOrderId: order?.id ?? null,
    error: typeof meta.error === 'string' ? meta.error : attempt?.error ?? null,
  }
}

/**
 * Loser path: wait until the claim winner finishes (completed/failed) or timeout.
 */
export async function waitForWalletCheckoutTerminal(
  transactionId: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<WalletCheckoutTerminal | null> {
  const timeoutMs = opts?.timeoutMs ?? 45_000
  const intervalMs = opts?.intervalMs ?? 400
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const snap = await loadTerminalSnapshot(transactionId)
    if (!snap) {
      await new Promise((r) => setTimeout(r, intervalMs))
      continue
    }
    const st = snap.transactionStatus.toLowerCase()
    if (st === 'completed' || st === 'failed' || st === 'refunded' || st === 'cancelled') {
      return snap
    }
    const rs = String(snap.rechargeStatus ?? '').toLowerCase()
    if (rs === 'success' || rs === 'failed' || rs === 'completed') {
      return snap
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  return loadTerminalSnapshot(transactionId)
}
