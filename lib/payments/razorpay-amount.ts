/** Razorpay order amounts are in the currency's smallest unit (not always ×100). */

const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR'])
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY'])

export function razorpayCurrencyExponent(currency: string): number {
  const code = currency.trim().toUpperCase()
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3
  return 2
}

/** Convert major-unit amount (e.g. 3.69 KWD) to Razorpay minor units (e.g. 3690 fils). */
export function toRazorpayMinorUnits(amount: number, currency: string): number {
  const exponent = razorpayCurrencyExponent(currency)
  const factor = 10 ** exponent
  return Math.round(amount * factor)
}

/** Convert Razorpay minor units back to major-unit amount for display/reconciliation. */
export function fromRazorpayMinorUnits(minorUnits: number, currency: string): number {
  const exponent = razorpayCurrencyExponent(currency)
  const factor = 10 ** exponent
  return minorUnits / factor
}
