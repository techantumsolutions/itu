import crypto from 'crypto'
import { runtimeEnv } from '@/lib/env/runtime'
import type { ProviderAuth } from '@/lib/providers/types'

const PREFIX = 'aggr:v1:'

function keyBytes(): Buffer | null {
  const raw = runtimeEnv('AGGREGATOR_CREDENTIAL_KEY') || runtimeEnv('PROVIDER_CREDENTIALS_KEY')
  if (!raw) return null
  return crypto.createHash('sha256').update(raw).digest()
}

export function encryptProviderCredentials(credentials: ProviderAuth | Record<string, unknown>): string {
  const key = keyBytes()
  const json = JSON.stringify(credentials)
  if (!key) return json
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`
}

export function decryptProviderCredentials(raw: string | null | undefined): ProviderAuth | undefined {
  if (!raw) return undefined
  if (!raw.startsWith(PREFIX)) {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as ProviderAuth) : undefined
    } catch {
      return undefined
    }
  }

  const key = keyBytes()
  if (!key) return undefined
  try {
    const payload = Buffer.from(raw.slice(PREFIX.length), 'base64')
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const encrypted = payload.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as ProviderAuth) : undefined
  } catch {
    return undefined
  }
}
