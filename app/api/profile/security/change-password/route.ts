import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseSignInWithPassword, supabaseAdminUpdateUser } from '@/lib/supabase/auth-rest'

export async function POST(request: Request) {
  const user = getRequestUser(request)
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const currentPassword = String(body.currentPassword || '')
  const newPassword = String(body.newPassword || '')

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Missing current or new password' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'New password must be at least 6 characters long' }, { status: 400 })
  }

  try {
    // 1. Verify current password by attempting to sign in
    try {
      await supabaseSignInWithPassword({ email: user.email, password: currentPassword })
    } catch (err: any) {
      return NextResponse.json({ error: 'Incorrect current password' }, { status: 401 })
    }

    // 2. Update password in auth system
    const updateRes = await supabaseAdminUpdateUser(user.id, { password: newPassword })
    if (updateRes.error) {
      return NextResponse.json({ error: updateRes.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Failed to update password due to a server error' }, { status: 500 })
  }
}
