import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  try {
    const denied = await requireAdminPermission(request, 'dashboard.view')
    if (denied) return denied

    // Fetch the 50 most recent notifications
    const res = await supabaseRest(
      'admin_notifications?select=id,title,message,type,details,is_read,created_at&order=created_at.desc&limit=50',
      { cache: 'no-store' },
    )

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const notifications = await res.json().catch(() => [])

    // Get exact count of unread notifications
    const countRes = await supabaseRest('admin_notifications?is_read=eq.false&select=id', {
      cache: 'no-store',
    })
    const unreadRows = countRes.ok ? await countRes.json().catch(() => []) : []
    const unreadCount = unreadRows.length

    return NextResponse.json({ notifications, unreadCount })
  } catch (error: any) {
    console.error('Failed to fetch admin notifications:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireAdminPermission(request, 'dashboard.view')
    if (denied) return denied

    const body = await request.json().catch(() => ({}))
    const { id, markAllAsRead } = body

    if (markAllAsRead) {
      // Mark all unread notifications as read
      const res = await supabaseRest('admin_notifications?is_read=eq.false', {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_read: true }),
      })
      if (!res.ok) {
        return NextResponse.json({ error: await res.text() }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing notification id' }, { status: 400 })
    }

    // Mark specific notification as read
    const res = await supabaseRest(`admin_notifications?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_read: true }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Failed to update admin notifications:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}
