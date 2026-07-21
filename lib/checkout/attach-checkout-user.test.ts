import { claimCheckoutTransactionOwnership } from '@/lib/checkout/attach-checkout-user'

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}))

import { supabaseRest } from '@/lib/db/supabase-rest'

const mockRest = supabaseRest as jest.MockedFunction<typeof supabaseRest>

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response
}

describe('claimCheckoutTransactionOwnership', () => {
  beforeEach(() => {
    mockRest.mockReset()
  })

  it('allows when transaction already owned by the same user', async () => {
    mockRest
      .mockResolvedValueOnce(jsonResponse([{ id: 't1', user_id: 'user-a' }]))
      .mockResolvedValueOnce(jsonResponse([])) // recharge_orders bind

    const result = await claimCheckoutTransactionOwnership({
      userId: 'user-a',
      transactionId: 't1',
    })
    expect(result).toEqual({ ok: true, bound: false })
  })

  it('rejects when transaction belongs to another user', async () => {
    mockRest.mockResolvedValueOnce(jsonResponse([{ id: 't1', user_id: 'user-b' }]))

    const result = await claimCheckoutTransactionOwnership({
      userId: 'user-a',
      transactionId: 't1',
    })
    expect(result).toEqual({ ok: false, error: 'Forbidden', status: 403 })
  })

  it('atomically binds null owner and wins', async () => {
    mockRest
      .mockResolvedValueOnce(jsonResponse([{ id: 't1', user_id: null }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 't1', user_id: 'user-a' }])) // claim PATCH
      .mockResolvedValueOnce(jsonResponse([])) // recharge_orders

    const result = await claimCheckoutTransactionOwnership({
      userId: 'user-a',
      transactionId: 't1',
    })
    expect(result).toEqual({ ok: true, bound: true })

    const claimCall = mockRest.mock.calls[1]
    expect(String(claimCall[0])).toContain('user_id=is.null')
    expect(claimCall[1]?.method).toBe('PATCH')
  })

  it('rejects when another user wins the null bind race', async () => {
    mockRest
      .mockResolvedValueOnce(jsonResponse([{ id: 't1', user_id: null }]))
      .mockResolvedValueOnce(jsonResponse([])) // lost claim (0 rows)
      .mockResolvedValueOnce(jsonResponse([{ id: 't1', user_id: 'user-b' }])) // re-read

    const result = await claimCheckoutTransactionOwnership({
      userId: 'user-a',
      transactionId: 't1',
    })
    expect(result).toEqual({ ok: false, error: 'Forbidden', status: 403 })
  })
})
