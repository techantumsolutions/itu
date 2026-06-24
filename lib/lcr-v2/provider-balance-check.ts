/**
 * Provider wallet balance checks before locking a provider for checkout.
 */
import { getBalance, isApiConfigured } from '@/lib/api/ding-connect'
import { fetchValuetopupBalance } from '@/lib/valuetopup'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'
import type { ProviderExecutionContext } from '@/lib/lcr-v2/provider-execution-context'

export const DING_INSUFFICIENT_BALANCE_LOG = '[LCR] Provider skipped: insufficient provider balance'

export type ProviderBalanceCheckResult = {
  checked: boolean
  sufficient: boolean
  availableBalance?: number | null
  requiredAmount?: number
  currency?: string | null
  reason?: string
  logMessage?: string
}

function finiteAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

function parseValuetopupBalancePayload(raw: unknown): { balance: number | null; currency: string | null } {
  if (!raw || typeof raw !== 'object') return { balance: null, currency: null }
  const root = raw as Record<string, unknown>
  const payload = (root.payLoad ?? root.payload ?? root.data ?? root) as Record<string, unknown>
  const balance =
    finiteAmount(payload.balance) ??
    finiteAmount(payload.available) ??
    finiteAmount(payload.availableBalance) ??
    finiteAmount(payload.walletBalance) ??
    finiteAmount(payload.amount)
  const currency =
    typeof payload.currency === 'string'
      ? payload.currency.trim().toUpperCase()
      : typeof payload.walletCurrency === 'string'
        ? payload.walletCurrency.trim().toUpperCase()
        : null
  return { balance, currency }
}

function valuetopupCredsFromProviderRow(providerRow: Record<string, unknown> | null | undefined) {
  if (!providerRow) return undefined
  const config = rowToProviderConfig(providerRow)
  const auth = config.auth
  if (!auth) return undefined
  const apiKey = auth.apiKey?.trim()
  const hmacSecret = auth.apiSecret?.trim()
  if (!apiKey || !hmacSecret) return undefined
  return {
    apiKey,
    hmacSecret,
    baseUrl: config.baseUrl,
  }
}

export async function checkProviderWalletBalance(input: {
  ctx: ProviderExecutionContext
  providerRow?: Record<string, unknown> | null
}): Promise<ProviderBalanceCheckResult> {
  const required = input.ctx.provider_wholesale_amount
  const requiredCurrency = input.ctx.provider_wholesale_currency?.trim().toUpperCase() || null
  const adapter = input.ctx.adapterKey.trim().toLowerCase()

  if (adapter === 'ding') {
    if (!isApiConfigured()) {
      return { checked: false, sufficient: true }
    }
    try {
      const balance = await getBalance()
      const available = finiteAmount(balance.Balance)
      if (balance.ResultCode === 1 && available != null && available < required) {
        return {
          checked: true,
          sufficient: false,
          availableBalance: available,
          requiredAmount: required,
          currency: balance.CurrencyIso ?? requiredCurrency,
          reason: 'insufficient_balance',
          logMessage: DING_INSUFFICIENT_BALANCE_LOG,
        }
      }
      return {
        checked: true,
        sufficient: true,
        availableBalance: available,
        requiredAmount: required,
        currency: balance.CurrencyIso ?? requiredCurrency,
      }
    } catch {
      return { checked: false, sufficient: true }
    }
  }

  if (adapter === 'valuetopup') {
    const creds = valuetopupCredsFromProviderRow(input.providerRow ?? null)
    if (!creds) {
      return { checked: false, sufficient: true }
    }
    try {
      const raw = await fetchValuetopupBalance(creds)
      const root = raw as Record<string, unknown>
      if (root.responseCode && String(root.responseCode) !== '000') {
        return { checked: false, sufficient: true }
      }
      const { balance, currency } = parseValuetopupBalancePayload(raw)
      if (balance == null) {
        return { checked: false, sufficient: true }
      }
      if (requiredCurrency && currency && requiredCurrency !== currency) {
        if (balance <= 0) {
          return {
            checked: true,
            sufficient: false,
            availableBalance: balance,
            requiredAmount: required,
            currency,
            reason: 'insufficient_balance',
            logMessage: '[LCR] Provider skipped: Value Topup wallet balance is zero',
          }
        }
        return {
          checked: true,
          sufficient: true,
          availableBalance: balance,
          requiredAmount: required,
          currency,
        }
      }
      if (balance < required) {
        return {
          checked: true,
          sufficient: false,
          availableBalance: balance,
          requiredAmount: required,
          currency,
          reason: 'insufficient_balance',
          logMessage: '[LCR] Provider skipped: insufficient Value Topup wallet balance',
        }
      }
      return {
        checked: true,
        sufficient: true,
        availableBalance: balance,
        requiredAmount: required,
        currency,
      }
    } catch {
      return { checked: false, sufficient: true }
    }
  }

  return { checked: false, sufficient: true }
}
