import { extractCheckoutTransactionId } from '@/lib/security/require-paid-recharge'
import { ADMIN_PERMISSION_KEYS } from '@/lib/auth/admin-permissions'

describe('recharge execution gates', () => {
  it('recognizes providers.execute as an admin permission key', () => {
    expect(ADMIN_PERMISSION_KEYS).toContain('providers.execute')
  })

  it('extracts checkout transaction ids for path A only', () => {
    expect(extractCheckoutTransactionId({ transactionId: ' txn-1 ' })).toBe('txn-1')
    expect(extractCheckoutTransactionId({ checkoutSessionId: 'sess-2' })).toBe('sess-2')
    expect(extractCheckoutTransactionId({ pendingTransactionId: 'pend-3' })).toBe('pend-3')
    expect(extractCheckoutTransactionId({ skuCode: 'X', sendAmount: 10 })).toBe('')
  })

  it('does not treat RECHARGE_PUBLIC_ENABLED as a code path (env is unused)', () => {
    // Guard: the public flag module API must not exist after F4 hardening.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/security/require-paid-recharge') as Record<string, unknown>
    expect(mod.isRechargePublicEnabled).toBeUndefined()
    expect(mod.isProductionRuntime).toBeUndefined()
  })
})
