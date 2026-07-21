/**
 * Server-side Supabase PostgREST access (service role).
 * Used for catalog reads/writes; bypasses RLS when service role is configured.
 */

import { runtimeEnv } from '@/lib/env/runtime'

export function isSupabaseCatalogConfigured(): boolean {
  return !!(runtimeEnv('SUPABASE_URL') && runtimeEnv('SUPABASE_SERVICE_ROLE_KEY'))
}

function normalizeSupabaseBaseUrl(raw: string): string {
  // Accept either:
  // - https://xyz.supabase.co
  // - https://xyz.supabase.co/
  // - https://xyz.supabase.co/rest/v1
  // - https://xyz.supabase.co/rest/v1/
  return raw
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/$/, '')
}

function supabaseAuthHeaders(extra?: HeadersInit): HeadersInit {
  const key = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for database-backed catalog')
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(extra as Record<string, string>),
  }
}

export async function supabaseRest(pathWithQuery: string, init?: RequestInit): Promise<Response> {
  const baseRaw = runtimeEnv('SUPABASE_URL')
  if (!baseRaw) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for database-backed catalog')
  }
  const base = normalizeSupabaseBaseUrl(baseRaw)
  const url = `${base}/rest/v1/${pathWithQuery.replace(/^\//, '')}`
  return fetch(url, {
    ...init,
    headers: {
      ...supabaseAuthHeaders(init?.headers),
    },
    cache: 'no-store',
  })
}

/** Call a Postgres function via PostgREST RPC (single DB transaction when the function is transactional). */
export async function supabaseRpc(
  functionName: string,
  args: Record<string, unknown>,
  init?: RequestInit,
): Promise<Response> {
  const baseRaw = runtimeEnv('SUPABASE_URL')
  if (!baseRaw) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for database-backed catalog')
  }
  const base = normalizeSupabaseBaseUrl(baseRaw)
  const url = `${base}/rest/v1/rpc/${functionName.replace(/^\//, '')}`
  return fetch(url, {
    ...init,
    method: 'POST',
    headers: {
      ...supabaseAuthHeaders(init?.headers),
    },
    body: JSON.stringify(args),
    cache: 'no-store',
  })
}
