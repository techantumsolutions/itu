import { runtimeEnv } from '@/lib/env/runtime'

/**
 * When true, send-OTP APIs may include `otp` in the JSON response so the UI can
 * show it on the verification screen (and log it in the browser console).
 *
 * Enabled when NODE_ENV !== 'production', or when SHOW_DEV_OTP=true|1|yes.
 * Turn SHOW_DEV_OTP off before real production traffic with working email/SMS.
 */
export function shouldExposeDevOtp(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const flag = (runtimeEnv('SHOW_DEV_OTP') ?? process.env.SHOW_DEV_OTP ?? '').trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}
