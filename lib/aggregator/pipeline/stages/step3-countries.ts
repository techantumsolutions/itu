import { supabaseRest } from '@/lib/db/supabase-rest'
import { getOrCreateCanonicalCountry } from '@/lib/aggregator/country-normalizer'

export async function runStep3Countries(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const res = await supabaseRest(`provider_operator_raw?service_provider_id=eq.${providerId}&select=*`, { cache: 'no-store' })
  const rawOps = await res.json().catch(() => []) as any[]

  let normalizedCount = 0
  for (const rawOp of rawOps) {
    const rawCountry = rawOp.raw_response_json?.country || rawOp.raw_response_json || {}
    const iso2 = rawOp.iso_code || rawOp.country_code || rawCountry.iso_code || ''
    const iso3 = rawCountry.iso_code3 || ''
    const countryName = rawCountry.name || ''

    const canonical = await getOrCreateCanonicalCountry({
      countryName: countryName || undefined,
      iso2: iso2 || undefined,
      iso3: iso3 || undefined,
    })
    if (canonical) {
      normalizedCount++
    }
  }

  return {
    success: true,
    message: `Normalized country ISO data. Checked ${rawOps.length} operators and updated ${normalizedCount} canonical country matches.`,
    data: {
      checked: rawOps.length,
      normalized: normalizedCount,
    },
  }
}
