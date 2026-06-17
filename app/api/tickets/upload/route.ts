import { NextResponse } from 'next/server'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'
import fs from 'fs'
import path from 'path'

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get('cookie') ?? ''
    const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
    let userId: string | null = null

    const token = m?.[1] ? decodeURIComponent(m[1]) : ''
    if (token) {
      const authUser = await supabaseGetUser(token)
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

    // Validate file extension
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

    const fileName = `ticket-${userId}-${Date.now()}.${ext}`

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'tickets')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const filePath = path.join(uploadDir, fileName)
    fs.writeFileSync(filePath, buffer)

    const fileUrl = `/uploads/tickets/${fileName}`

    return NextResponse.json({
      ok: true,
      url: fileUrl,
    })
  } catch (e: any) {
    console.error('Ticket attachment upload failed:', e)
    return NextResponse.json({ ok: false, error: e.message || 'Upload failed' }, { status: 500 })
  }
}
