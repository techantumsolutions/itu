import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { countriesList } from '@/lib/country-codes'
import { logAdminActivity } from '@/lib/auth/audit'

/**
 * POST /api/admin/seed-dial-prefixes
 * Seeds countries.dial_prefix for all countries that are missing it,
 * using libphonenumber-js as the authoritative source via countriesList.
 * Must be called from server context (Next.js) where ESM imports work.
 */
export async function POST() {
  // Build iso2 -> dialCode lookup from libphonenumber-js
  const callingCodeMap = new Map<string, string>()
  for (const c of countriesList) {
    callingCodeMap.set(c.code.toUpperCase(), c.dialCode.replace('+', '').trim())
  }

  // Fetch all countries from DB
  const res = await supabaseRest('countries?select=id,iso2,iso3,dial_prefix&limit=1000', {
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: 500 })
  }
  const rows = (await res.json()) as {
    id: string
    iso2: string | null
    iso3: string | null
    dial_prefix: string | null
  }[]

  const missing = rows.filter((r) => !r.dial_prefix || r.dial_prefix.trim() === '')
  let updated = 0
  const failed: string[] = []
  const skipped: string[] = []

  for (const country of missing) {
    if (!country.iso2) {
      skipped.push(country.id)
      continue
    }
    const prefix = callingCodeMap.get(country.iso2.toUpperCase())
    if (!prefix) {
      skipped.push(country.iso2)
      continue
    }
    const upd = await supabaseRest(`countries?id=eq.${encodeURIComponent(country.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ dial_prefix: prefix }),
    })
    if (upd.ok) {
      updated++
    } else {
      failed.push(`${country.iso2}: ${await upd.text()}`)
    }
  }

  await logAdminActivity({
    action: 'Seed Dial Prefixes',
    pageName: 'System',
    details: {
      total: rows.length,
      alreadyHad: rows.length - missing.length,
      missing: missing.length,
      updated,
      skipped: skipped.length,
      failed: failed.length,
    },
  })

  return NextResponse.json({
    total: rows.length,
    alreadyHad: rows.length - missing.length,
    missing: missing.length,
    updated,
    skipped: skipped.length,
    skippedList: skipped,
    failed: failed.length,
    failedList: failed,
  })
}
