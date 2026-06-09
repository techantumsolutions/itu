import { supabaseRest } from '@/lib/db/supabase-rest'
import * as countries from 'i18n-iso-countries'

function getCleanedBaseName(name: string, countryIso3: string, countryIso2: string): string {
  let clean = name.toLowerCase().trim()

  const countryNames = [
    'india', 'france', 'spain', 'germany', 'italy', 'uk', 'usa', 'united kingdom',
    'united states', 'rwanda', 'nigeria', 'pakistan', 'bangladesh', 'indonesia'
  ]
  for (const cn of countryNames) {
    clean = clean.replace(new RegExp(`\\b${cn}\\b`, 'gi'), '')
  }

  clean = clean.replace(new RegExp(`\\b${countryIso3.toLowerCase()}\\b`, 'gi'), '')
  clean = clean.replace(new RegExp(`\\b${countryIso2.toLowerCase()}\\b`, 'gi'), '')

  clean = clean.replace(/\b(5g|4g|3g|2g|lte)\b/gi, '')
  clean = clean.replace(/\b(telecom|telecommunications|mobile|networks?|cellular|communications?|recharge|prepaid|postpaid|limited|ltd|plc|corp|corporation)\b/gi, '')

  clean = clean.replace(/\d+/g, '')
  clean = clean.replace(/[^a-z0-9]/gi, ' ')
  clean = clean.replace(/\s+/g, ' ').trim()

  return clean
}

export async function runStep6Merge(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}&status=eq.active`, { cache: 'no-store' })
  const aggOps = await opsRes.json().catch(() => []) as any[]

  // Group by country
  const countryGroups = new Map<string, any[]>()
  for (const op of aggOps) {
    const country = op.country_iso3
    if (!countryGroups.has(country)) {
      countryGroups.set(country, [])
    }
    countryGroups.get(country)!.push(op)
  }

  let totalMerged = 0

  for (const [country, opsInCountry] of countryGroups.entries()) {
    const iso2 = countries.alpha3ToAlpha2(country) || ''
    const baseNameGroups = new Map<string, any[]>()

    for (const op of opsInCountry) {
      const cleanedBase = getCleanedBaseName(op.name, country, iso2)
      if (cleanedBase) {
        if (!baseNameGroups.has(cleanedBase)) {
          baseNameGroups.set(cleanedBase, [])
        }
        baseNameGroups.get(cleanedBase)!.push(op)
      }
    }

    for (const [baseName, group] of baseNameGroups.entries()) {
      if (group.length > 1) {
        // Canonical is the one with the shortest name
        const canonical = group.reduce((prev, curr) => prev.name.length <= curr.name.length ? prev : curr)
        
        for (const dup of group) {
          if (dup.id === canonical.id) continue

          // Update duplicate plans to canonical
          await supabaseRest(`agg_plans?operator_id=eq.${dup.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ operator_id: canonical.id })
          })

          // Inactivate duplicate operator
          await supabaseRest(`agg_operators?id=eq.${dup.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'inactive', name: `${dup.name} (Merged into ${canonical.name})` })
          })

          totalMerged++
        }
      }
    }
  }

  return {
    success: true,
    message: `Filter 2 (Consolidation Name Merging) applied. Consolidate-merged ${totalMerged} duplicate operators in staging.`,
    data: {
      merged: totalMerged,
    },
  }
}
