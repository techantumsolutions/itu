import { checkProviderWalletBalance } from '@/lib/lcr-v2/provider-balance-check'
import type { ProviderExecutionContext } from '@/lib/lcr-v2/provider-execution-context'

jest.mock('@/lib/api/ding-connect', () => ({
  isApiConfigured: jest.fn(() => true),
  getBalance: jest.fn(),
}))

jest.mock('@/lib/valuetopup', () => ({
  fetchValuetopupBalance: jest.fn(),
}))

import { getBalance } from '@/lib/api/ding-connect'
import { fetchValuetopupBalance } from '@/lib/valuetopup'

const mockedGetBalance = getBalance as jest.MockedFunction<typeof getBalance>
const mockedVtBalance = fetchValuetopupBalance as jest.MockedFunction<typeof fetchValuetopupBalance>

function baseContext(overrides: Partial<ProviderExecutionContext> = {}): ProviderExecutionContext {
  return {
    providerId: 'p-ding',
    providerPlanId: 'sku-1',
    adapterKey: 'ding',
    providerPayloadStrategy: 'WHOLESALE_AMOUNT',
    provider_wholesale_amount: 50,
    provider_wholesale_currency: 'USD',
    destination_face_value: null,
    destination_currency: null,
    customer_payment_amount: 100,
    customer_payment_currency: 'INR',
    phoneDigits: '919876543210',
    externalId: 'TXN-TEST-1',
    ...overrides,
  }
}

describe('checkProviderWalletBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects Ding when balance is below wholesale amount', async () => {
    mockedGetBalance.mockResolvedValue({
      ResultCode: 1,
      Balance: 10,
      CurrencyIso: 'USD',
    } as Awaited<ReturnType<typeof getBalance>>)

    const result = await checkProviderWalletBalance({ ctx: baseContext() })

    expect(result.checked).toBe(true)
    expect(result.sufficient).toBe(false)
    expect(result.reason).toBe('insufficient_balance')
  })

  it('accepts Ding when balance covers wholesale amount', async () => {
    mockedGetBalance.mockResolvedValue({
      ResultCode: 1,
      Balance: 100,
      CurrencyIso: 'USD',
    } as Awaited<ReturnType<typeof getBalance>>)

    const result = await checkProviderWalletBalance({ ctx: baseContext() })

    expect(result.checked).toBe(true)
    expect(result.sufficient).toBe(true)
  })

  it('rejects Value Topup when wallet balance is below required amount', async () => {
    mockedVtBalance.mockResolvedValue({
      responseCode: '000',
      payLoad: { balance: 5, currency: 'INR' },
    })

    const result = await checkProviderWalletBalance({
      ctx: baseContext({
        adapterKey: 'valuetopup',
        provider_wholesale_amount: 77.73,
        provider_wholesale_currency: 'INR',
      }),
      providerRow: {
        id: 'p-vt',
        code: 'VALUETOPUP',
        name: 'Value Topup',
        adapter_key: 'valuetopup',
        is_active: true,
        credentials_encrypted: JSON.stringify({ apiKey: 'key', apiSecret: 'secret' }),
      },
    })

    expect(result.checked).toBe(true)
    expect(result.sufficient).toBe(false)
    expect(result.reason).toBe('insufficient_balance')
  })
})
