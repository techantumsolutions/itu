import crypto from 'crypto'
import { runtimeEnv } from '@/lib/env/runtime'
import { supabaseRest } from '@/lib/db/supabase-rest'
import type { ProviderAuth } from '@/lib/providers/types'

/** Stored ciphertext prefix (versioned for future algorithm rotation). */
export const CREDENTIALS_CIPHER_PREFIX = 'aggr:v1:'

const IV_BYTES = 12
const TAG_BYTES = 16

export class ProviderCredentialDecryptionError extends Error {
  readonly providerId?: string

  constructor(message: string, providerId?: string) {
    super(message)
    this.name = 'ProviderCredentialDecryptionError'
    this.providerId = providerId
  }
}

export class ProviderCredentialEncryptionKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderCredentialEncryptionKeyError'
  }
}

function masterKeyBytes(): Buffer | null {
  const raw =
    runtimeEnv('MASTER_ENCRYPTION_KEY') ||
    runtimeEnv('AGGREGATOR_CREDENTIAL_KEY') ||
    runtimeEnv('PROVIDER_CREDENTIALS_KEY')
  if (!raw) return null
  return crypto.createHash('sha256').update(raw, 'utf8').digest()
}

export function isEncryptionKeyConfigured(): boolean {
  return masterKeyBytes() != null
}

export function isEncryptedProviderCredentialsBlob(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && raw.startsWith(CREDENTIALS_CIPHER_PREFIX)
}

/** Detect legacy plain JSON credentials still stored in credentials_encrypted. */
export function isPlaintextProviderCredentialsJson(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false
  const t = raw.trim()
  if (!t || isEncryptedProviderCredentialsBlob(t)) return false
  if (!t.startsWith('{')) return false
  try {
    const parsed = JSON.parse(t) as unknown
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}

function encryptJsonString(json: string): string {
  const key = masterKeyBytes()
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new ProviderCredentialEncryptionKeyError(
        'MASTER_ENCRYPTION_KEY is not configured; cannot store provider credentials',
      )
    }
    console.warn(
      '[credentials] MASTER_ENCRYPTION_KEY missing; storing provider credentials as plain JSON (development only)',
    )
    return json
  }
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${CREDENTIALS_CIPHER_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`
}

/**
 * Encrypt credentials object for storage in lcr_providers.credentials_encrypted.
 * Idempotent when passed an already-encrypted blob string.
 */
export function encryptProviderCredentials(
  credentials: ProviderAuth | Record<string, unknown>,
): string {
  return encryptJsonString(JSON.stringify(credentials))
}

/** Normalize any credentials input for DB write (encrypt unless already encrypted). */
export function encryptProviderCredentialsForStorage(
  input: ProviderAuth | Record<string, unknown> | string | null | undefined,
): string | null {
  if (input == null) return null
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return null
    if (isEncryptedProviderCredentialsBlob(trimmed)) return trimmed
    if (isPlaintextProviderCredentialsJson(trimmed)) {
      return encryptJsonString(trimmed)
    }
    throw new Error('Invalid credentials payload for storage')
  }
  return encryptProviderCredentials(input)
}

/**
 * Decrypt credentials_encrypted blob to a plain object.
 * Transparently parses legacy plain JSON when encryption key is absent or blob is unencrypted.
 */
export function decryptProviderCredentials(
  raw: string | null | undefined,
  context?: { providerId?: string },
): ProviderAuth | Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  if (isPlaintextProviderCredentialsJson(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as ProviderAuth | Record<string, unknown>)
        : undefined
    } catch {
      return undefined
    }
  }

  if (!isEncryptedProviderCredentialsBlob(trimmed)) {
    return undefined
  }

  const key = masterKeyBytes()
  if (!key) {
    const id = context?.providerId
    console.error(
      `[credentials] Cannot decrypt provider credentials${id ? ` for provider ${id}` : ''}: encryption key is not configured`,
    )
    return undefined
  }

  try {
    const payload = Buffer.from(trimmed.slice(CREDENTIALS_CIPHER_PREFIX.length), 'base64')
    if (payload.length < IV_BYTES + TAG_BYTES + 1) {
      throw new ProviderCredentialDecryptionError('Invalid encrypted credentials payload', context?.providerId)
    }
    const iv = payload.subarray(0, IV_BYTES)
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
    const encrypted = payload.subarray(IV_BYTES + TAG_BYTES)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as ProviderAuth | Record<string, unknown>
  } catch {
    const id = context?.providerId
    console.error(
      `[credentials] Failed to decrypt provider credentials${id ? ` for provider ${id}` : ''}`,
    )
    return undefined
  }
}

function enc(v: string): string {
  return encodeURIComponent(v)
}

/**
 * If credentials are still plain JSON at rest, encrypt and persist (idempotent).
 * Returns the encrypted blob when updated, or null when unchanged.
 */
export async function reencryptPlaintextCredentialsAtRest(
  providerId: string,
  raw: string | null | undefined,
): Promise<string | null> {
  if (!providerId?.trim() || !isPlaintextProviderCredentialsJson(raw)) return null
  if (!isEncryptionKeyConfigured()) return null

  try {
    const encrypted = encryptProviderCredentialsForStorage(raw!)
    if (!encrypted || !isEncryptedProviderCredentialsBlob(encrypted)) return null

    const res = await supabaseRest(`lcr_providers?id=eq.${enc(providerId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ credentials_encrypted: encrypted }),
    })
    if (!res.ok) {
      console.error(`[credentials] Failed to persist encrypted credentials for provider ${providerId}`)
      return null
    }
    return encrypted
  } catch {
    console.error(`[credentials] Failed to re-encrypt credentials at rest for provider ${providerId}`)
    return null
  }
}

export type MigrateProviderCredentialsResult = {
  scanned: number
  encrypted: number
  skipped: number
  errors: number
}

/** One-time / idempotent migration: encrypt all plaintext lcr_providers.credentials_encrypted rows. */
export async function migrateAllProviderCredentialsToEncrypted(): Promise<MigrateProviderCredentialsResult> {
  const result: MigrateProviderCredentialsResult = { scanned: 0, encrypted: 0, skipped: 0, errors: 0 }

  if (!isEncryptionKeyConfigured()) {
    throw new ProviderCredentialEncryptionKeyError(
      'MASTER_ENCRYPTION_KEY is not configured; cannot migrate provider credentials',
    )
  }

  const res = await supabaseRest(
    'lcr_providers?select=id,credentials_encrypted',
    { cache: 'no-store' },
  )
  if (!res.ok) throw new Error(await res.text())

  const rows = (await res.json()) as Array<{ id: string; credentials_encrypted?: string | null }>
  for (const row of rows) {
    result.scanned += 1
    const id = String(row.id ?? '').trim()
    const raw = row.credentials_encrypted ?? null
    if (!raw?.trim()) {
      result.skipped += 1
      continue
    }
    if (isEncryptedProviderCredentialsBlob(raw)) {
      result.skipped += 1
      continue
    }
    if (!isPlaintextProviderCredentialsJson(raw)) {
      result.skipped += 1
      continue
    }
    const updated = await reencryptPlaintextCredentialsAtRest(id, raw)
    if (updated) result.encrypted += 1
    else result.errors += 1
  }

  return result
}

/** Strip credential blobs from audit / activity log payloads. */
export function redactProviderSecretsInAuditDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  if (!('credentials_encrypted' in details)) return details
  return { ...details, credentials_encrypted: '[redacted]' }
}
