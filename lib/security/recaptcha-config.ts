/**
 * Central switch for Google reCAPTCHA.
 *
 * Disabled by default. Set NEXT_PUBLIC_RECAPTCHA_ENABLED=true to turn it back on
 * (also requires NEXT_PUBLIC_RECAPTCHA_SITE_KEY + RECAPTCHA_SECRET_KEY).
 */
export function isRecaptchaEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED?.trim().toLowerCase()
  if (flag === 'true' || flag === '1') return true
  if (flag === 'false' || flag === '0') return false
  // Default: off until explicitly enabled
  return false
}
