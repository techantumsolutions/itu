import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { loadAllOperatorMergeHistory } from '@/lib/aggregator/operator-merge-history'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const countryIso3 = normalizeCountryIso3(url.searchParams.get('countryIso3') ?? '')
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()

  let rows = await loadAllOperatorMergeHistory(countryIso3 || undefined)

  if (q) {
    rows = rows.filter((row) =>
      [
        row.sourceOperatorName,
        row.targetOperatorName,
        row.sourceMergeKey,
        row.targetMergeKey,
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
