import {
  assertDtoneProductIdSource,
  extractDtoneRequiredCreditPartyFields,
  formatDtoneMobileNumber,
  isDtoneDvsApiHost,
  resolveDtoneTransactionPath,
  DTONE_DVS_SYNC_TRANSACTION_PATH,
  DTONE_LEGACY_TRANSACTION_PATH,
  validateDtoneCreditPartyPayload,
} from '@/lib/dtone'
import { buildDtoneRechargeRequestAudit } from '@/lib/providers/dtone-recharge'

describe('resolveDtoneTransactionPath', () => {
  it('uses sync path for preprod DVS API', () => {
    expect(resolveDtoneTransactionPath('https://preprod-dvs-api.dtone.com')).toBe(
      DTONE_DVS_SYNC_TRANSACTION_PATH,
    )
    expect(isDtoneDvsApiHost('https://preprod-dvs-api.dtone.com')).toBe(true)
  })

  it('uses sync path for production DVS API', () => {
    expect(resolveDtoneTransactionPath('https://dvs-api.dtone.com')).toBe(
      DTONE_DVS_SYNC_TRANSACTION_PATH,
    )
  })

  it('uses legacy path for prepaid.dtone.com', () => {
    expect(resolveDtoneTransactionPath('https://prepaid.dtone.com')).toBe(
      DTONE_LEGACY_TRANSACTION_PATH,
    )
    expect(isDtoneDvsApiHost('https://prepaid.dtone.com')).toBe(false)
  })
})

describe('formatDtoneMobileNumber', () => {
  it('prefixes + when missing', () => {
    expect(formatDtoneMobileNumber('919876543210')).toBe('+919876543210')
  })

  it('preserves existing + prefix', () => {
    expect(formatDtoneMobileNumber('+919876543210')).toBe('+919876543210')
  })
})

describe('assertDtoneProductIdSource', () => {
  it('accepts product_id from provider_plan_id', () => {
    expect(
      assertDtoneProductIdSource({
        providerPlanId: '56876',
        productId: 56876,
        destinationFaceValue: 219,
        wholesaleAmount: 2.68,
      }),
    ).toEqual({ valid: true })
  })

  it('rejects product_id matching destination face value', () => {
    const result = assertDtoneProductIdSource({
      providerPlanId: '219',
      productId: 219,
      destinationFaceValue: 219,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/destination/)
  })

  it('rejects product_id matching wholesale amount', () => {
    const result = assertDtoneProductIdSource({
      providerPlanId: '3',
      productId: 3,
      wholesaleAmount: 3,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/wholesale/)
  })
})

describe('validateDtoneCreditPartyPayload', () => {
  it('requires mobile_number by default when raw has no required fields', () => {
    expect(
      validateDtoneCreditPartyPayload(null, {
        product_id: 1,
        credit_party_identifier: { mobile_number: '+919876543210' },
      }),
    ).toBeNull()
  })

  it('fails when required mobile_number is missing', () => {
    expect(
      validateDtoneCreditPartyPayload(
        { required_credit_party_identifier_fields: [['mobile_number']] },
        { product_id: 1, credit_party_identifier: {} },
      ),
    ).toMatch(/mobile_number/)
  })

  it('buildDtoneRechargeRequestAudit resolves full URL for preprod DVS API', () => {
    const audit = buildDtoneRechargeRequestAudit({
      rechargeBaseUrl: 'https://preprod-dvs-api.dtone.com',
      catalogBaseUrl: 'https://preprod-dvs-api.dtone.com',
      providerPlanId: '12345',
      productId: 12345,
      payload: {
        external_id: 'EXT-1',
        product_id: 12345,
        auto_confirm: true,
        credit_party_identifier: { mobile_number: '+919876543210' },
      },
      requiredCreditPartyFields: [['mobile_number']],
    })
    expect(audit.url).toBe('https://preprod-dvs-api.dtone.com/v1/sync/transactions')
    expect(audit.path).toBe('/v1/sync/transactions')
    expect(audit.body.product_id).toBe(12345)
  })
})

