import { fromRazorpayMinorUnits, toRazorpayMinorUnits } from '@/lib/payments/razorpay-amount'

describe('razorpay amount minor units', () => {
  it('converts INR with 2 decimal places', () => {
    expect(toRazorpayMinorUnits(349.5, 'INR')).toBe(34950)
    expect(fromRazorpayMinorUnits(34950, 'INR')).toBe(349.5)
  })

  it('converts KWD with 3 decimal places', () => {
    expect(toRazorpayMinorUnits(3.69, 'KWD')).toBe(3690)
    expect(fromRazorpayMinorUnits(3690, 'KWD')).toBe(3.69)
  })

  it('converts JPY with 0 decimal places', () => {
    expect(toRazorpayMinorUnits(1200, 'JPY')).toBe(1200)
  })
})
