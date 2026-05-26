import { NextResponse } from 'next/server'
import { guardCatalog } from '@/lib/db/require-catalog'
import { detectPublicOperator } from '@/lib/catalog/public-catalog'

export async function POST(request: Request) {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : ''

    if (!phoneNumber || !countryCode) {
      return NextResponse.json({ error: 'phoneNumber and countryCode are required' }, { status: 400 })
    }

    const result = await detectPublicOperator({ phoneNumber, countryCode })
    return NextResponse.json(result)
  } catch (error) {
    console.error('operator/detect:', error)
    return NextResponse.json({ error: 'Failed to detect operator' }, { status: 500 })
  }
}
