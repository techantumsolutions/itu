import { useState, useEffect } from 'react'
import fpPromise from '@fingerprintjs/fingerprintjs'

export function useFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  useEffect(() => {
    async function getFingerprint() {
      try {
        const fp = await fpPromise.load()
        const result = await fp.get()
        setFingerprint(result.visitorId)
      } catch (e) {
        console.error('Failed to get fingerprint:', e)
      }
    }
    getFingerprint()
  }, [])

  return fingerprint
}
