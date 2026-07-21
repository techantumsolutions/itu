import { NextResponse } from 'next/server'
import { resolveUserIdFromAccessToken } from '@/lib/auth/session-cache'
import { verifyOtpSessionCookie } from '@/lib/auth/otp-session-cookie'
import {
  sanitizeStorageFileName,
  STORAGE_BUCKETS,
  uploadObject,
} from '@/lib/storage/object-storage'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? ''
    const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
    let userId: string | null = null

    const token = m?.[1] ? decodeURIComponent(m[1]) : ''
    if (token) {
      userId = await resolveUserIdFromAccessToken(token)
    }

    if (!userId) {
      userId = verifyOtpSessionCookie(cookie)
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }

    const fileType = file.type
    const allowedMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'application/pdf',
    ]
    if (!allowedMimeTypes.includes(fileType)) {
      return NextResponse.json(
        { ok: false, error: 'Only image files (PNG, JPG, JPEG, GIF, WEBP) and PDF files are allowed.' },
        { status: 400 }
      )
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const allowedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf']
    if (!allowedExtensions.includes(ext)) {
      return NextResponse.json(
        { ok: false, error: 'Only PNG, JPG, JPEG, GIF, WEBP and PDF extensions are allowed.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileName = sanitizeStorageFileName(`ticket-${userId}-${Date.now()}.${ext}`)

    const uploaded = await uploadObject({
      bucket: STORAGE_BUCKETS.tickets,
      path: `${userId}/${fileName}`,
      body: buffer,
      contentType: fileType,
    })

    return NextResponse.json({
      ok: true,
      url: uploaded.publicUrl,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Upload failed'
    console.error('Ticket attachment upload failed:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
