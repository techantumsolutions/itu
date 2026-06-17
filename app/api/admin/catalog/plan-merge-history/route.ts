import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { loadPlanMergeHistory } from '@/lib/aggregator/plan-merge-history'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'products', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const countryIso3 = normalizeCountryIso3(url.searchParams.get('countryIso3') ?? '')
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()

  let rows = await loadPlanMergeHistory(countryIso3 || undefined)

  if (q) {
    rows = rows.filter((row) =>
      [
        row.sourcePlanName,
        row.targetPlanName,
        row.sourcePlanSignature,
        row.targetPlanSignature,
        row.systemOperatorMergeKey,
        row.countryIso3,
        row.mergedByAdmin ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }

  return NextResponse.json({ history: rows })
}
