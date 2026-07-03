'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecaptchaCheckboxHandle } from '@/components/security/RecaptchaCheckbox'

/**
 * Manages reCAPTCHA token state and resets the widget when `resetWhen` changes
 * (e.g. email/username edits after solving CAPTCHA).
 */
export function useRecaptchaField(resetWhen?: string) {
  const [captchaToken, setCaptchaToken] = useState('')
  const recaptchaRef = useRef<RecaptchaCheckboxHandle | null>(null)

  const resetCaptcha = useCallback(() => {
    setCaptchaToken('')
    recaptchaRef.current?.reset()
  }, [])

  useEffect(() => {
    resetCaptcha()
  }, [resetWhen, resetCaptcha])

  return {
    captchaToken,
    setCaptchaToken,
    recaptchaRef,
    resetCaptcha,
    hasCaptcha: Boolean(captchaToken),
  }
}
