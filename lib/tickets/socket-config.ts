import { runtimeEnv } from '@/lib/env/runtime'

const DEFAULT_SOCKET_PORT = '3001'
const DEFAULT_SOCKET_HOST = '127.0.0.1'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

/** Server-side URL for POST /api/broadcast (Next.js API → socket server). */
export function getSocketServerUrl(): string {
  const explicit = runtimeEnv('SOCKET_SERVER_URL')
  if (explicit) return stripTrailingSlash(explicit)

  const host = runtimeEnv('SOCKET_HOST') ?? DEFAULT_SOCKET_HOST
  const port = runtimeEnv('SOCKET_PORT') ?? DEFAULT_SOCKET_PORT
  return `http://${host}:${port}`
}

export function getSocketBroadcastUrl(): string {
  return `${getSocketServerUrl()}/api/broadcast`
}

/**
 * Browser Socket.io URL (must be NEXT_PUBLIC_* — set before `next build` on production).
 * Falls back to same host as the app with SOCKET_PORT when only NEXT_PUBLIC_APP_URL is set.
 */
export function getPublicSocketServerUrl(): string {
  const explicit = runtimeEnv('NEXT_PUBLIC_SOCKET_SERVER_URL')
  if (explicit) return stripTrailingSlash(explicit)

  const appUrl = runtimeEnv('NEXT_PUBLIC_APP_URL')
  if (appUrl) {
    try {
      const parsed = new URL(appUrl)
      parsed.port = runtimeEnv('SOCKET_PORT') ?? DEFAULT_SOCKET_PORT
      return stripTrailingSlash(parsed.origin)
    } catch {
      // ignore invalid URL
    }
  }

  const host =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : DEFAULT_SOCKET_HOST
  const port = runtimeEnv('SOCKET_PORT') ?? DEFAULT_SOCKET_PORT
  const protocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? 'https:'
      : 'http:'

  return stripTrailingSlash(`${protocol}//${host}:${port}`)
}

export function isSocketServerConfigured(): boolean {
  return runtimeEnv('SOCKET_SERVER_DISABLED') !== 'true'
}

/** HTTP header carrying the shared secret for server-to-server broadcast calls. */
export const BROADCAST_SECRET_HEADER = 'x-broadcast-secret'

// Documented development-only fallback. NEVER used in production: if
// SOCKET_BROADCAST_SECRET is missing in production we fail fast (throw).
const DEV_ONLY_BROADCAST_SECRET = 'dev-only-insecure-broadcast-secret'

/**
 * Shared secret authenticating POST /api/broadcast (Next.js API → socket server).
 * Production requires SOCKET_BROADCAST_SECRET; development uses a documented fallback.
 */
export function getBroadcastSecret(): string {
  const secret = runtimeEnv('SOCKET_BROADCAST_SECRET')?.trim()
  if (secret) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SOCKET_BROADCAST_SECRET is required in production to authenticate socket broadcasts',
    )
  }

  return DEV_ONLY_BROADCAST_SECRET
}
