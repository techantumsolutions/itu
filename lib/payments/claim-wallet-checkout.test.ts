import {
  claimWalletCheckoutFulfillment,
  releaseWalletCheckoutClaim,
} from '@/lib/payments/claim-wallet-checkout'
import { supabaseRest } from '@/lib/db/supabase-rest'

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}))

jest.mock('@/lib/lcr-v2/recharge-db', () => ({
  dbFindRechargeByDistributorRef: jest.fn().mockResolvedValue(null),
}))

const rest = supabaseRest as jest.MockedFunction<typeof supabaseRest>

describe('claimWalletCheckoutFulfillment', () => {
  beforeEach(() => {
    rest.mockReset()
  })

  it('returns claimed:true when conditional UPDATE moves pending_payment → processing', async () => {
    rest.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 'tx-1', status: 'processing' }]), { status: 200 }),
    )

    const result = await claimWalletCheckoutFulfillment('tx-1')
    expect(result).toEqual({ ok: true, claimed: true })
    expect(rest).toHaveBeenCalledWith(
      'transactions?id=eq.tx-1&status=eq.pending_payment',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"status":"processing"'),
      }),
    )
  })

  it('returns claimed:false for concurrent loser with current status', async () => {
    rest
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'tx-1', status: 'processing' }]), { status: 200 }),
      )

    const result = await claimWalletCheckoutFulfillment('tx-1')
    expect(result).toEqual({ ok: true, claimed: false, currentStatus: 'processing' })
  })

  it('rejects empty transaction id without RPC', async () => {
    const result = await claimWalletCheckoutFulfillment('  ')
    expect(result.ok).toBe(false)
    expect(rest).not.toHaveBeenCalled()
  })
})

describe('releaseWalletCheckoutClaim', () => {
  beforeEach(() => {
    rest.mockReset()
  })

  it('patches processing back to pending_payment', async () => {
    rest.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await releaseWalletCheckoutClaim('tx-1')
    expect(rest).toHaveBeenCalledWith(
      'transactions?id=eq.tx-1&status=eq.processing',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"status":"pending_payment"'),
      }),
    )
  })
})
