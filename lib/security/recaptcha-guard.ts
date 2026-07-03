import { NextResponse } from 'next/server'
import {
  resolveAllowedRecaptchaHostnames,
  verifyRecaptchaToken,
  type RecaptchaVerifyResult,
} from '@/lib/security/recaptcha-verify'

export const CAPTCHA_REQUIRED_MESSAGE = 'Please complete the CAPTCHA verification.'

export type CaptchaBody = { captchaToken?: string }

export function getRequestIp(req: Request): string {
  let ip = req.headers.get('x-forwarded-for') || '127.0.0.1'
  if (ip.includes(',')) ip = ip.split(',')[0].trim()
  return ip
}

export async function verifyRequestCaptcha(
  req: Request,
  captchaToken: string | undefined | null,
  remoteIp?: string,
): Promise<RecaptchaVerifyResult> {
  const requestHost = req.headers.get('host')
  return verifyRecaptchaToken({
    token: captchaToken ?? '',
    remoteIp: remoteIp ?? getRequestIp(req),
    allowedHostnames: resolveAllowedRecaptchaHostnames(requestHost),
  })
}

export function captchaDeniedResponse(message?: string, status: 400 | 403 = 403) {
  const msg = message ?? CAPTCHA_REQUIRED_MESSAGE
  return NextResponse.json({ ok: false, success: false, message: msg, error: msg }, { status })
}

export async function requireCaptcha(
  req: Request,
  captchaToken: string | undefined | null,
  remoteIp?: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!captchaToken?.trim()) {
    return { ok: false, response: captchaDeniedResponse('Please verify that you are not a robot.', 403) }
  }

  const result = await verifyRequestCaptcha(req, captchaToken, remoteIp)
  if (!result.ok) {
    return { ok: false, response: captchaDeniedResponse(result.message, 403) }
  }

  return { ok: true }
}
