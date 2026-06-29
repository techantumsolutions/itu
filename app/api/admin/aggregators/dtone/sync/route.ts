import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { syncDtoneCatalog } from '@/lib/aggregators/dtone-sync'

export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'providers.sync')
  if (denied) return denied

  try {
    const result = await syncDtoneCatalog()
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
