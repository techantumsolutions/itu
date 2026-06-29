'use client'

import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const
const CHECK_INTERVAL_MS = 15_000

export function useIdleTimeout(input: {
  enabled: boolean
  idleMs: number
  onIdle: () => void
}) {
  const { enabled, idleMs, onIdle } = input
  const lastActivityRef = useRef(Date.now())
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!enabled || idleMs <= 0) return

    lastActivityRef.current = Date.now()
    const hasFiredRef = { current: false }

    const bump = () => {
      lastActivityRef.current = Date.now()
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, bump, { passive: true })
    }

    const tick = window.setInterval(() => {
      if (hasFiredRef.current) return
      if (Date.now() - lastActivityRef.current >= idleMs) {
        hasFiredRef.current = true
        onIdleRef.current()
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, bump)
      }
      window.clearInterval(tick)
    }
  }, [enabled, idleMs])
}
