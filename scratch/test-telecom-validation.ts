import { validateRawOperatorPlans } from '../lib/aggregator/telecom-validator'

function mockRawPlan(overrides: any = {}): any {
  return {
    raw_json: {
      benefits: overrides.benefits || [],
      service: overrides.service || { name: '', subservice: { name: '' } },
      tags: overrides.tags || [],
      type: overrides.type || 'Plan',
      description: overrides.description || '',
      product_name: overrides.productName || overrides.name || '',
      ...overrides.raw
    }
  }
}

async function run() {
  console.log('--- OPERATOR RAW PLANS VALIDATOR VERIFICATION ---')

  // Case 1: Airtel (100% Mobile Recharge plans)
  const airtelPlans = [
    mockRawPlan({ name: 'Airtel Unlimited Talktime + 1.5GB/day Data', benefits: [{ type: 'DATA' }], service: { name: 'Mobile' } }),
    mockRawPlan({ name: 'Airtel 100 SMS Pack', benefits: [{ type: 'SMS' }], service: { name: 'Mobile' } }),
    mockRawPlan({ name: 'Airtel Airtime 10 Topup', benefits: [{ type: 'AIRTIME' }], service: { name: 'Mobile' } })
  ]
  const airtelResult = validateRawOperatorPlans(airtelPlans)
  console.log(`Airtel: Passed = ${airtelResult.passed}, Reason = ${airtelResult.reason}, Ratio = ${airtelResult.telecomRatio}`)
  if (!airtelResult.passed) console.error('Airtel should have passed!')

  // Case 2: Crunchyroll (100% Subscriptions)
  const crunchyrollPlans = [
    mockRawPlan({ description: 'Crunchyroll Fan 1 Month Premium Subscription', type: 'DigitalProduct' }),
    mockRawPlan({ description: 'Crunchyroll Mega Fan Membership', type: 'DigitalProduct' })
  ]
  const crunchyResult = validateRawOperatorPlans(crunchyrollPlans)
  console.log(`Crunchyroll: Passed = ${crunchyResult.passed}, Reason = ${crunchyResult.reason}, Ratio = ${crunchyResult.telecomRatio}`)
  if (crunchyResult.passed) console.error('Crunchyroll should have failed!')

  // Case 3: BigBasket (100% Gift Cards)
  const bigBasketPlans = [
    mockRawPlan({ description: 'BigBasket Gift Card INR 500', type: 'GiftCard' }),
    mockRawPlan({ description: 'BigBasket Shopping eVoucher', type: 'Voucher' })
  ]
  const bigBasketResult = validateRawOperatorPlans(bigBasketPlans)
  console.log(`BigBasket: Passed = ${bigBasketResult.passed}, Reason = ${bigBasketResult.reason}, Ratio = ${bigBasketResult.telecomRatio}`)
  if (bigBasketResult.passed) console.error('BigBasket should have failed!')

  // Case 4: Badlanders (100% Gaming Credits)
  const badlandersPlans = [
    mockRawPlan({ description: 'Badlanders 300 game coupons', type: 'Gaming' }),
    mockRawPlan({ description: 'Badlanders credits voucher', type: 'Voucher' })
  ]
  const badlandersResult = validateRawOperatorPlans(badlandersPlans)
  console.log(`Badlanders: Passed = ${badlandersResult.passed}, Reason = ${badlandersResult.reason}, Ratio = ${badlandersResult.telecomRatio}`)
  if (badlandersResult.passed) console.error('Badlanders should have failed!')

  // Case 5: Mixed Airtel (High Telecom Ratio)
  const mixedHighPlans = [
    ...airtelPlans,
    mockRawPlan({ description: 'Airtel Disney+ Hotstar Subscription Pack', type: 'Subscription' }) // 3 recharges, 1 streaming plan
  ]
  const mixedHighResult = validateRawOperatorPlans(mixedHighPlans)
  console.log(`Mixed High Ratio Operator: Passed = ${mixedHighResult.passed}, Reason = ${mixedHighResult.reason}, Ratio = ${mixedHighResult.telecomRatio}`)
  if (!mixedHighResult.passed) console.error('Mixed High Ratio should have passed!')

  // Case 6: Mixed Operator (Low Telecom Ratio)
  const mixedLowPlans = [
    mockRawPlan({ benefits: [{ type: 'AIRTIME' }], description: 'Airtel Airtime 10 Topup', service: { name: 'Mobile' } }),
    mockRawPlan({ description: 'Airtel Disney+ Hotstar Subscription Pack', type: 'Subscription' }),
    mockRawPlan({ description: 'Airtel Wynk Music Membership', type: 'Subscription' }),
    mockRawPlan({ description: 'Airtel Xstream OTT Access Pack', type: 'Subscription' }),
    mockRawPlan({ description: 'Amazon Prime 1 Month Subscription', type: 'Subscription' }),
    mockRawPlan({ description: 'Netflix Premium membership', type: 'Subscription' }),
    mockRawPlan({ description: 'YouTube Premium 1 Month', type: 'Subscription' }),
    mockRawPlan({ description: 'Spotify Premium 3 Months', type: 'Subscription' }),
    mockRawPlan({ description: 'SonyLIV Premium Voucher', type: 'Voucher' }),
    mockRawPlan({ description: 'Zee5 Premium Coupon', type: 'Coupon' })
  ] // 1 recharge, 9 subscriptions/vouchers -> ratio 0.1, but total negative counts is 9 which is > telecom count 1. Fails ratio/dominance!
  const mixedLowResult = validateRawOperatorPlans(mixedLowPlans)
  console.log(`Mixed Low Ratio Operator: Passed = ${mixedLowResult.passed}, Reason = ${mixedLowResult.reason}, Ratio = ${mixedLowResult.telecomRatio}`)
  if (mixedLowResult.passed) console.error('Mixed Low Ratio should have failed!')

  console.log('\n--- VERIFICATION DONE ---')
}

run()
