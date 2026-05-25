import { NextResponse } from 'next/server'
import { dbFetchOperators, pickOperatorForPhone } from '@/lib/db/catalog'
import { guardCatalog } from '@/lib/db/require-catalog'
import { fetchDtoneMobileNumberLookup } from '@/lib/dtone'

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

    // Prefer DT One lookup when configured. This avoids incorrect local defaulting.
    // DT One expects E.164-like number without "+" in many accounts; we send digits only.
    try {
      const digits = phoneNumber.replace(/\D/g, '')
      if (digits.length >= 8) {
        const lookup = (await fetchDtoneMobileNumberLookup({ mobile_number: digits })) as any
        const opId = lookup?.operator?.id
        const opName = lookup?.operator?.name
        const iso3 = lookup?.operator?.country?.iso_code
        if (opId != null && opName) {
          return NextResponse.json({
            operator: String(opName).trim(),
            providerCode: String(opId).trim(), // aggregator operator id (string)
            country: String(iso3 || countryCode).trim(),
            source: 'dtone',
            raw: lookup,
          })
        }
      }
    } catch {
      // fall through to existing behavior
    }

    const operators = await dbFetchOperators(countryCode)
    const picked = pickOperatorForPhone(operators, phoneNumber)

    if (!picked) {
      return NextResponse.json({
        operator: 'Unknown',
        providerCode: undefined as string | undefined,
        country: countryCode,
      })
    }

    return NextResponse.json({
      operator: (picked.short_name ?? picked.name).trim(),
      providerCode: picked.code,
      country: countryCode,
    })
  } catch (error) {
    console.error('operator/detect:', error)
    return NextResponse.json({ error: 'Failed to detect operator' }, { status: 500 })
  }
}
