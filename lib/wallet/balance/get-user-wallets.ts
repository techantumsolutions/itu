/**
 * User wallet balance read / ensure-default-wallet.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'

export type UserWalletBalanceResult =
  | {
      ok: true
      balance: number
      currency: string
      maxConsumptionPercentage: number
      wallets: Array<{ currency: string; balance: number }>
    }
  | { ok: false; error: string; status: number }

export async function getUserWalletBalances(userId: string): Promise<UserWalletBalanceResult> {
  const profileRes = await supabaseRest(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=currency&limit=1`,
    { cache: 'no-store' },
  )
  let preferredCurrency = 'USD'
  if (profileRes.ok) {
    const rows = await profileRes.json().catch(() => [])
    if (rows?.[0]?.currency) {
      preferredCurrency = rows[0].currency
    }
  }

  let maxConsumptionPercentage = 100
  const settingsRes = await supabaseRest(
    'app_settings?key=eq.wallet_max_consumption_percentage&select=value&limit=1',
    { cache: 'no-store' },
  )
  if (settingsRes.ok) {
    const rows = await settingsRes.json().catch(() => [])
    if (rows?.[0]?.value !== undefined) {
      maxConsumptionPercentage = Number(rows[0].value) ?? 100
    }
  }

  const res = await supabaseRest(
    `wallets?user_id=eq.${encodeURIComponent(userId)}&select=balance,currency`,
    { cache: 'no-store' },
  )
  if (!res.ok) {
    return { ok: false, error: 'Failed to load wallet', status: 500 }
  }

  let wallets = await res.json().catch(() => [])
  if (wallets.length === 0) {
    const createRes = await supabaseRest('wallets', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ user_id: userId, currency: preferredCurrency, balance: 0 }]),
    })
    if (!createRes.ok) {
      return { ok: false, error: 'Failed to create wallet', status: 500 }
    }
    const createdWallet = await createRes.json().catch(() => [])
    wallets = createdWallet
  }

  let activeWallet = wallets.find((w: { currency?: string }) => w.currency === preferredCurrency)
  if (!activeWallet) {
    activeWallet = wallets[0]
  }

  return {
    ok: true,
    balance: Number(activeWallet.balance) || 0,
    currency: activeWallet.currency || preferredCurrency,
    maxConsumptionPercentage,
    wallets: wallets.map((w: { currency?: string; balance?: number }) => ({
      currency: w.currency,
      balance: Number(w.balance) || 0,
    })),
  }
}
