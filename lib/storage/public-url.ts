/**
 * Browser-reachable Supabase storage URLs.
 * Keep this module free of server-only imports so client components can use it.
 */

function trimBase(raw: string): string {
  return raw.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
}

/** Prefer NEXT_PUBLIC (browser) then SUPABASE_URL (server). */
export function publicSupabaseBaseUrl(): string {
  const pub = (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : '') || ''
  if (pub.trim()) return trimBase(pub)
  const internal = (typeof process !== 'undefined' ? process.env.SUPABASE_URL : '') || ''
  if (internal.trim()) return trimBase(internal)
  return ''
}

/**
 * Rewrite storage object URLs so browsers can load them.
 * Uploads often store URLs built from internal SUPABASE_URL (e.g. http://supabase-kong:8000).
 */
export function toPublicStorageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  const publicBase = publicSupabaseBaseUrl()
  if (!publicBase) return url

  try {
    const parsed = new URL(url)
    if (!parsed.pathname.includes('/storage/v1/object/')) return url
    const publicOrigin = new URL(publicBase).origin
    if (parsed.origin === publicOrigin) return url
    return `${publicBase}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

/** Alias for client components. */
export function toBrowserStorageUrl(url: string | null | undefined): string {
  return toPublicStorageUrl(url) || ''
}

export function isImageAttachmentUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url)
}
