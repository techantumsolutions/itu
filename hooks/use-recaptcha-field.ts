'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecaptchaCheckboxHandle } from '@/components/security/RecaptchaCheckbox'
import { isRecaptchaEnabled } from '@/lib/security/recaptcha-config'

/**
 * Manages reCAPTCHA token state and resets the widget when `resetWhen` changes
 * (e.g. email/username edits after solving CAPTCHA).
 */
export function useRecaptchaField(resetWhen?: string) {
  const enabled = isRecaptchaEnabled()
  const [captchaToken, setCaptchaToken] = useState('')
  const recaptchaRef = useRef<RecaptchaCheckboxHandle | null>(null)

  const resetCaptcha = useCallback(() => {
    setCaptchaToken('')
    recaptchaRef.current?.reset()
  }, [])

  useEffect(() => {
    if (!enabled) return
    resetCaptcha()
  }, [resetWhen, resetCaptcha, enabled])

  return {
    captchaToken,
    setCaptchaToken,
    recaptchaRef,
    resetCaptcha,
    hasCaptcha: enabled ? Boolean(captchaToken) : true,
  }
}
