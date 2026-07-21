/**
 * Edge-safe request ID helpers (no Node AsyncLocalStorage).
 * Used by proxy.ts and shared with Node context module.
 */
export const REQUEST_ID_HEADER = 'x-request-id'

export function newRequestId(): string {
  return crypto.randomUUID()
}

/** Normalize inbound header or generate a new id. */
export function resolveRequestId(incoming?: string | null): string {
  const v = (incoming ?? '').trim()
  if (v && v.length <= 128 && /^[\w\-.:]+$/.test(v)) return v
  return newRequestId()
}
