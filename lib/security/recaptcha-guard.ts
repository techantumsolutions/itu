import { NextResponse } from 'next/server'
import {
  resolveAllowedRecaptchaHostnames,
  verifyRecaptchaToken,
  type RecaptchaVerifyResult,
} from '@/lib/security/recaptcha-verify'

export const CAPTCHA_REQUIRED_MESSAGE = 'Please complete the CAPTCHA verification.'

export type CaptchaBody = { captchaToken?: string }

export function getRequestIp(req: Request): string {
  // 1. Check client-real-ip cookie first
  const cookieHeader = req.headers.get('cookie') || ''
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, value] = cookie.split('=').map(c => c.trim())
    if (name) acc[name] = value
    return acc
  }, {} as Record<string, string>)
  
  if (cookies['client-real-ip']) {
    const ip = cookies['client-real-ip']
    const isLoopback =
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip.toLowerCase() === 'localhost' ||
      ip === '0:0:0:0:0:0:0:1' ||
      ip.toLowerCase().includes('::ffff:127.0.0.1')
    if (!isLoopback) {
      return ip
    }
  }

  // 2. Check standard headers
  const ipHeaders = [
    'cf-connecting-ip',
    'x-client-ip',
    'x-real-ip',
    'x-forwarded-for',
    'x-vercel-forwarded-for',
    'fastly-client-ip',
    'true-client-ip',
    'x-cluster-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ]

  let fallbackIp: string | null = null

  for (const headerName of ipHeaders) {
    const value = req.headers.get(headerName)
    if (!value) continue

    const parts = value.split(',').map(p => p.trim())
    for (const ip of parts) {
      if (!ip) continue
      const isLoopback =
        ip === '::1' ||
        ip === '127.0.0.1' ||
        ip.toLowerCase() === 'localhost' ||
        ip === '0:0:0:0:0:0:0:1' ||
        ip.toLowerCase().includes('::ffff:127.0.0.1')

      if (!isLoopback) {
        return ip
      } else if (!fallbackIp) {
        fallbackIp = ip
      }
    }
  }

  return fallbackIp || '127.0.0.1'
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
