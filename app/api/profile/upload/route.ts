import { NextResponse } from 'next/server'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { fetchProfileForUser } from '@/lib/auth/get-admin-from-request'
import { buildUserFromProfile } from '@/lib/auth/build-auth-user'
import fs from 'fs'
import path from 'path'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? ''
    const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
    let userId: string | null = null
    let authUser: any = null

    const token = m?.[1] ? decodeURIComponent(m[1]) : ''
    if (token) {
      authUser = await supabaseGetUser(token)
      if (authUser?.id) {
        userId = authUser.id
      }
    }

    if (!userId) {
      // Fallback: check if we have the fallback itu-user-id cookie
      const om = cookie.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
      userId = om?.[1] ? decodeURIComponent(om[1]) : null
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }

    // Validate MIME type
    const fileType = file.type
    if (fileType !== 'image/png' && fileType !== 'image/jpeg' && fileType !== 'image/jpg') {
      return NextResponse.json(
        { ok: false, error: 'Only PNG and JPG/JPEG files are allowed.' },
        { status: 400 }
      )
    }

    // Validate file extension
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
      return NextResponse.json(
        { ok: false, error: 'Only PNG and JPG/JPEG file extensions are allowed.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate unique filename to avoid browser cache issues
    const sanitizedExt = ext === 'png' ? 'png' : 'jpg'
    const fileName = `avatar-${userId}-${Date.now()}.${sanitizedExt}`

    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const filePath = path.join(uploadDir, fileName)
    fs.writeFileSync(filePath, buffer)

    const imageUrl = `/uploads/${fileName}`

    // Update the profiles table
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

    // Fetch the updated profile and construct client user object
    const profile = await fetchProfileForUser(userId)
    
    // Construct authUser if we didn't have it (fallback case)
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
  } catch (e: any) {
    console.error('Profile image upload failed:', e)
    return NextResponse.json({ ok: false, error: e.message || 'Profile image upload failed' }, { status: 500 })
  }
}
