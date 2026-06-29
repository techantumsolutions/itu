export const PAGE_PASSWORD_UNLOCK_STORAGE_KEY = 'itu_unlocked_pages'

export function readPagePasswordUnlockMap(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const stored = window.sessionStorage.getItem(PAGE_PASSWORD_UNLOCK_STORAGE_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

export function writePagePasswordUnlockMap(map: Record<string, number>): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PAGE_PASSWORD_UNLOCK_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function clearPagePasswordUnlocks(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(PAGE_PASSWORD_UNLOCK_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
