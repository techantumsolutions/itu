import { supabaseRest } from '@/lib/db/supabase-rest'
import { stripOperatorCountryAffixes } from '@/lib/aggregator/pipeline/operator-country-strip'
import * as countries from 'i18n-iso-countries'

export async function runStep5FilterTelecom(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}&status=eq.active`, { cache: 'no-store' })
  const aggOps = await opsRes.json().catch(() => []) as any[]

  let renamedCount = 0
  let unchangedCount = 0

  for (const op of aggOps) {
    const operatorName = op.operator_name || op.name
    const countryIso3 = String(op.country_iso3 ?? '').toUpperCase()
    const countryName = countries.getName(countryIso3, 'en') || undefined
    const strippedName = stripOperatorCountryAffixes(operatorName, countryIso3, countryName)

    if (!strippedName || strippedName === operatorName) {
      unchangedCount++
      continue
    }

    await supabaseRest(`agg_operators?id=eq.${op.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: strippedName }),
    }).catch(() => {})
    renamedCount++
  }

  return {
    success: true,
    message: `Step 5 complete. Stripped country affixes from ${renamedCount} active operators (${unchangedCount} unchanged).`,
    data: {
      evaluated: aggOps.length,
      renamed: renamedCount,
      unchanged: unchangedCount,
      active: aggOps.length,
    },
  }
}
