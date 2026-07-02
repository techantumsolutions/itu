import { NextResponse } from 'next/server'
import { fetchDtoneProducts } from '@/lib/dtone'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'providers.view')
  if (denied) return denied

  try {
    const data = await fetchDtoneProducts()

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error),
      },
      { status: 500 },
    )
  }
}
