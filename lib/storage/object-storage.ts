/**
 * Object storage via Supabase Storage (shared across web replicas).
 * Prefer this over writing under public/uploads.
 */

import { runtimeEnv } from '@/lib/env/runtime'

export type UploadObjectInput = {
  bucket: string
  path: string
  body: Buffer | ArrayBuffer | Blob | Uint8Array
  contentType: string
  /** upsert existing object */
  upsert?: boolean
}

export type UploadObjectResult = {
  bucket: string
  path: string
  /** Public URL when bucket is public */
  publicUrl: string
}

function storageBaseUrl(): string {
  const baseRaw = runtimeEnv('SUPABASE_URL')
  if (!baseRaw) throw new Error('SUPABASE_URL missing')
  return baseRaw.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
}

function serviceKey(): string {
  const key = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
  return key
}

export async function uploadObject(input: UploadObjectInput): Promise<UploadObjectResult> {
  const base = storageBaseUrl()
  const key = serviceKey()
  const path = input.path.replace(/^\/+/, '')
  const url = `${base}/storage/v1/object/${input.bucket}/${path}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': input.contentType || 'application/octet-stream',
      ...(input.upsert ? { 'x-upsert': 'true' } : {}),
    },
    body: input.body as BodyInit,
    cache: 'no-store',
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`storage_upload_failed:${res.status}:${err}`)
  }

  return {
    bucket: input.bucket,
    path,
    publicUrl: `${base}/storage/v1/object/public/${input.bucket}/${path}`,
  }
}

export const STORAGE_BUCKETS = {
  avatars: 'user_avatars',
  tickets: 'ticket_attachments',
  ads: 'ads_media',
} as const

export function sanitizeStorageFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '').slice(0, 180) || 'file'
}
