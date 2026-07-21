import { NextResponse } from 'next/server'
import { resolveSupabaseUserFromAccessToken, resolveUserIdFromAccessToken } from '@/lib/auth/session-cache'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
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
    let authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null

    const token = m?.[1] ? decodeURIComponent(m[1]) : ''
    if (token) {
      authUser = await resolveSupabaseUserFromAccessToken(token)
      userId = authUser?.id ?? (await resolveUserIdFromAccessToken(token))
    }

    if (!userId) {
      userId = verifyOtpSessionCookie(cookie)
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const currentProfile = await fetchProfileForUser(userId)
    const isAdmin = currentProfile?.app_role === 'admin' || currentProfile?.app_role === 'super_admin'
    if (currentProfile && !currentProfile.is_registered_with_email && !isAdmin) {
      return NextResponse.json(
        { ok: false, error: 'Email & password registration is required to upload profile image.' },
        { status: 403 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }

    const fileType = file.type
    if (fileType !== 'image/png' && fileType !== 'image/jpeg' && fileType !== 'image/jpg') {
      return NextResponse.json(
        { ok: false, error: 'Only PNG and JPG/JPEG files are allowed.' },
        { status: 400 }
      )
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
      return NextResponse.json(
        { ok: false, error: 'Only PNG and JPG/JPEG file extensions are allowed.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const sanitizedExt = ext === 'png' ? 'png' : 'jpg'
    const fileName = sanitizeStorageFileName(`avatar-${userId}-${Date.now()}.${sanitizedExt}`)

    const uploaded = await uploadObject({
      bucket: STORAGE_BUCKETS.avatars,
      path: `${userId}/${fileName}`,
      body: buffer,
      contentType: fileType,
      upsert: true,
    })

    const imageUrl = uploaded.publicUrl

    const updateRes = await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageUrl,
        updated_at: new Date().toISOString(),
      }),
    })

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '')
      console.error('Profile image database update error:', errText)
      return NextResponse.json({ ok: false, error: 'Failed to update profile image in database' }, { status: 500 })
    }

    const profile = await fetchProfileForUser(userId)

    if (!authUser && profile) {
      authUser = {
        id: userId,
        email: profile.email ?? '',
        user_metadata: { name: profile.name ?? '' },
      }
    }

    const clientUser = authUser ? buildUserFromProfile(authUser, profile) : null

    return NextResponse.json({
      ok: true,
      imageUrl,
      user: clientUser,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Profile image upload failed'
    console.error('Profile image upload failed:', e)
    return NextResponse.json({ ok: false, error: message || 'Profile image upload failed' }, { status: 500 })
  }
}
