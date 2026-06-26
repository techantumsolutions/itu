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
