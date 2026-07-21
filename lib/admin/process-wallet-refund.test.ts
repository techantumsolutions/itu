import { processAdminWalletRefund } from '@/lib/admin/process-wallet-refund'
import { supabaseRpc } from '@/lib/db/supabase-rest'

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRpc: jest.fn(),
}))

const rpc = supabaseRpc as jest.MockedFunction<typeof supabaseRpc>

describe('processAdminWalletRefund', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('maps successful first-time refund', async () => {
    rpc.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          idempotent: false,
          code: 'REFUNDED',
          transaction_id: 'tx-1',
          refund_id: 'rf-1',
          refund_transaction_id: 'rtx-1',
          amount: 10,
          currency: 'INR',
          message: 'Refund credited to user wallet',
        }),
        { status: 200 },
      ),
    )

    const result = await processAdminWalletRefund({ transactionId: 'tx-1', adminUserId: 'admin-1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.idempotent).toBe(false)
      expect(result.refundId).toBe('rf-1')
      expect(result.code).toBe('REFUNDED')
    }
    expect(rpc).toHaveBeenCalledWith('admin_process_wallet_refund', {
      p_transaction_id: 'tx-1',
      p_admin_user_id: 'admin-1',
    })
  })

  it('maps idempotent already-refunded as success', async () => {
    rpc.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          idempotent: true,
          code: 'ALREADY_REFUNDED',
          transaction_id: 'tx-1',
          message: 'Transaction has already been refunded',
        }),
        { status: 200 },
      ),
    )

    const result = await processAdminWalletRefund({ transactionId: 'tx-1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.idempotent).toBe(true)
      expect(result.code).toBe('ALREADY_REFUNDED')
    }
  })

  it('maps not eligible to 400', async () => {
    rpc.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          code: 'NOT_ELIGIBLE',
          error: 'Refund is only allowed when the recharge delivery failed.',
        }),
        { status: 200 },
      ),
    )

    const result = await processAdminWalletRefund({ transactionId: 'tx-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.code).toBe('NOT_ELIGIBLE')
    }
  })

  it('rejects empty transaction id without RPC', async () => {
    const result = await processAdminWalletRefund({ transactionId: '  ' })
    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
