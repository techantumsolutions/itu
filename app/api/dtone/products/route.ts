import { NextResponse } from 'next/server'
import { fetchDtoneProducts } from '@/lib/dtone'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export async function GET() {
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
      { status: 500 }
    )
  }
}

