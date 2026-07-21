'use client'

import { forwardRef, useCallback, useImperativeHandle, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { isRecaptchaEnabled } from '@/lib/security/recaptcha-config'
import { cn } from '@/lib/utils'

const GoogleRecaptcha = dynamic(() => import('react-google-recaptcha'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Loading CAPTCHA…
    </div>
  ),
})

export type RecaptchaCheckboxHandle = {
  reset: () => void
  clearToken: () => void
}

export type RecaptchaCheckboxProps = {
  /** Called when reCAPTCHA returns a valid token. */
  onTokenChange: (token: string) => void
  className?: string
  disabled?: boolean
}

function resolveSiteKey(): string {
  const key = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim()
  if (key) return key
  if (process.env.NODE_ENV === 'development') {
    return '6LeIxAcTAAAAAGG-vFI1TnRWxM1XIwvBM1LxG4l'
  }
  return ''
}

export const RecaptchaCheckbox = forwardRef<RecaptchaCheckboxHandle, RecaptchaCheckboxProps>(
  function RecaptchaCheckbox({ onTokenChange, className, disabled = false }, ref) {
    const [widgetKey, setWidgetKey] = useState(0)
    const [loading, setLoading] = useState(true)
    const [widgetError, setWidgetError] = useState<string | null>(null)

    const siteKey = resolveSiteKey()

    const clearToken = useCallback(() => {
      onTokenChange('')
    }, [onTokenChange])

    const reset = useCallback(() => {
      clearToken()
      setWidgetError(null)
      setLoading(true)
      setWidgetKey((k) => k + 1)
    }, [clearToken])

    useImperativeHandle(ref, () => ({ reset, clearToken }), [reset, clearToken])

    if (!isRecaptchaEnabled()) {
      return null
    }

    if (!siteKey) {
      return (
        <p className="text-center text-xs text-destructive" role="alert">
          CAPTCHA is not configured. Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY.
        </p>
      )
    }

    return (
      <div className={cn('flex min-h-[78px] flex-col items-center justify-center gap-2 py-2', className)}>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading CAPTCHA…
          </div>
        ) : null}
        <div className={disabled ? 'pointer-events-none opacity-50' : undefined}>
          <GoogleRecaptcha
            key={widgetKey}
            sitekey={siteKey}
            onChange={(token) => {
              setLoading(false)
              setWidgetError(null)
              onTokenChange(token ?? '')
            }}
            onExpired={() => {
              clearToken()
              setWidgetError('CAPTCHA expired. Please verify again.')
            }}
            onErrored={() => {
              clearToken()
              setLoading(false)
              setWidgetError('CAPTCHA verification failed. Please try again.')
            }}
            asyncScriptOnLoad={() => setLoading(false)}
          />
        </div>
        {widgetError ? (
          <p className="text-center text-xs text-destructive" role="alert">
            {widgetError}
          </p>
        ) : null}
      </div>
    )
  },
)
