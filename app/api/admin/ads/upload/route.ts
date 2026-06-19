import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { runtimeEnv } from '@/lib/env/runtime'

export async function POST(request: Request) {
  const isAuthorized = await adminCanUseFeature(request, 'ads', { allowLegacyHeader: true });
  if (!isAuthorized) {
    console.error('Upload Route: adminCanUseFeature returned false! Headers:', Object.fromEntries(request.headers.entries()));
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const baseRaw = runtimeEnv('SUPABASE_URL')
    const key = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
    if (!baseRaw || !key) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 })
    }
    
    const base = baseRaw.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`
    const bucket = 'ads_media'

    const storageUrl = `${base}/storage/v1/object/${bucket}/${fileName}`

    const res = await fetch(storageUrl, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Supabase Storage Upload Error:', err)
      return NextResponse.json({ error: 'Failed to upload to Supabase Storage' }, { status: 500 })
    }

    // Since the bucket is public, the URL is accessible directly
    const publicUrl = `${base}/storage/v1/object/public/${bucket}/${fileName}`

    return NextResponse.json({ url: publicUrl })
  } catch (error: any) {
    console.error('Ads upload error:', error.message)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
