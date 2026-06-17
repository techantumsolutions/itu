import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  loadCountryRegistry,
  lookupCountryInRegistry,
  logUnknownCountry,
} from '@/lib/aggregator/country-registry'
import { validateCountriesTable } from '@/lib/aggregator/country-startup-validation'
import {
  dbUpsertAggCountries,
  dbUpsertAggOperators,
  dbUpsertAggPlans,
  dbReplaceAggPlanBenefits,
} from '@/lib/db/agg-catalog'
import * as countries from 'i18n-iso-countries'
import { stringToBigInt } from '@/lib/aggregator/agg-id-hash'
import { resolvePlanCountryCode } from '@/lib/aggregator/plan-country-resolver'

const RAW_PAGE_SIZE = 1000

/** PostgREST defaults to 1000 rows; paginate so large providers (e.g. DING) import fully. */
async function fetchAllProviderRawRows(
  table: 'provider_operator_raw' | 'provider_plans_raw',
  providerId: string,
): Promise<any[]> {
  const filter =
    table === 'provider_operator_raw'
      ? `service_provider_id=eq.${providerId}`
      : `provider_id=eq.${providerId}`

  const rows: any[] = []
  let offset = 0

  while (true) {
    const res = await supabaseRest(
      `${table}?${filter}&select=*&limit=${RAW_PAGE_SIZE}&offset=${offset}`,
      { cache: 'no-store' },
    )
    if (!res.ok) throw new Error(`Failed to load ${table}: ${await res.text()}`)
    const page = (await res.json()) as any[]
    rows.push(...page)
    if (page.length < RAW_PAGE_SIZE) break
    offset += RAW_PAGE_SIZE
  }

  return rows
}

function resolveCountryIso3(op: any, registry: Awaited<ReturnType<typeof loadCountryRegistry>>): string {
  const rawCountry = op.raw_response_json?.country || op.raw_response_json || {}
  const countryInput = {
    countryName: rawCountry.name || undefined,
    iso2: op.iso_code || op.country_code || rawCountry.iso_code || undefined,
    iso3: rawCountry.iso_code3 || undefined,
  }
  const canonical = lookupCountryInRegistry(registry, countryInput)
  if (canonical?.iso3) return canonical.iso3.toUpperCase()

  const iso = String(op.iso_code || op.country_code || rawCountry.iso_code || 'UNK').toUpperCase()
  if (iso.length === 3) return iso
  return countries.alpha2ToAlpha3(iso) || 'UNK'
}

export async function runStep3Countries(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  await validateCountriesTable()
  const registry = await loadCountryRegistry()

  await supabaseRest(`agg_plans?provider=eq.${config.code}`, { method: 'DELETE' })
  await supabaseRest(`agg_operators?provider=eq.${config.code}`, { method: 'DELETE' })

  const rawOps = await fetchAllProviderRawRows('provider_operator_raw', providerId)
  const rawPlans = await fetchAllProviderRawRows('provider_plans_raw', providerId)

  const countryMap = new Map<string, { iso3: string; iso2?: string; name: string; raw_response: any }>()
  let matchedCount = 0
  let unknownCount = 0

  for (const op of rawOps) {
    const rawCountry = op.raw_response_json?.country || op.raw_response_json || {}
    const countryIso3 = resolveCountryIso3(op, registry)
    const countryInput = {
      countryName: rawCountry.name || undefined,
      iso2: op.iso_code || op.country_code || rawCountry.iso_code || undefined,
      iso3: rawCountry.iso_code3 || undefined,
    }

    if (lookupCountryInRegistry(registry, countryInput)) {
      matchedCount++
    } else {
      unknownCount++
      logUnknownCountry(config.code, countryInput)
    }

    if (countryIso3 !== 'UNK') {
      const iso2 = countries.alpha3ToAlpha2(countryIso3) || undefined
      const name = rawCountry.name || countries.getName(countryIso3, 'en') || `Country ${countryIso3}`
      countryMap.set(countryIso3, {
        iso3: countryIso3,
        iso2,
        name,
        raw_response: rawCountry,
      })
    }
  }

  if (countryMap.size > 0) {
    await dbUpsertAggCountries(Array.from(countryMap.values()))
  }

  const validCountries = new Set(countryMap.keys())
  const opsInput = rawOps
    .map((op) => {
      const countryIso3 = resolveCountryIso3(op, registry)
      return {
        provider: config.code as any,
        aggregator_operator_id: stringToBigInt(op.provider_operator_id),
        country_iso3: countryIso3,
        name: op.provider_operator_name,
        regions: [],
        raw_response: op.raw_response_json,
        service_domain: 'UNKNOWN',
        service_domain_confidence: 0,
        service_domain_source: 'raw_import',
        operator_domain: 'UNKNOWN',
        operator_domain_confidence: 0,
        domain_classification_source: 'raw_import',
      }
    })
    .filter((o) => validCountries.has(o.country_iso3))

  const upsertedOps = await dbUpsertAggOperators(opsInput)
  const opIdMap = new Map<number, string>()
  for (const row of upsertedOps ?? []) {
    opIdMap.set(Number(row.aggregator_operator_id), row.id)
  }

  const plansInput = rawPlans
    .map((rp) => {
      const rawOp = rawOps.find((o) => o.id === rp.provider_operator_raw_id)
      if (!rawOp) return null

      const aggOpId = stringToBigInt(rawOp.provider_operator_id)
      const dbOpUuid = opIdMap.get(aggOpId)
      if (!dbOpUuid) return null

      const operatorCountryIso3 = resolveCountryIso3(rawOp, registry)
      const countryCode =
        rp.country_code && String(rp.country_code).trim()
          ? String(rp.country_code).trim().toUpperCase()
          : resolvePlanCountryCode({
              planName: rp.provider_plan_name,
              planDescription: rp.description,
              rawPlan: rp.raw_json,
              operatorCountryIso3,
            })

      return {
        provider: config.code as any,
        aggregator_plan_id: stringToBigInt(rp.provider_plan_id),
        operator_id: dbOpUuid,
        type: rp.plan_type || 'UNKNOWN',
        name: rp.provider_plan_name || 'Plan',
        description: rp.description,
        retail_amount: rp.amount ? Number(rp.amount) : null,
        currency_unit: rp.currency,
        raw_response: rp.raw_json,
        service_domain: 'UNKNOWN',
        service_domain_confidence: 0,
        service_domain_source: 'raw_import',
        status: 'active',
        country_code: countryCode,
      }
    })
    .filter(Boolean) as any[]

  const upsertedPlans = await dbUpsertAggPlans(plansInput)
  const planIdByAggId = new Map<number, string>()
  for (const row of upsertedPlans ?? []) {
    planIdByAggId.set(Number(row.aggregator_plan_id), row.id)
  }

  let plansUpserted = 0
  for (const rp of rawPlans) {
    const planDbId = planIdByAggId.get(stringToBigInt(rp.provider_plan_id))
    if (!planDbId) continue

    const rawBenefits = Array.isArray(rp.benefits_json) ? rp.benefits_json : []
    const benefits = rawBenefits.map((b: any) => ({
      type: String(b?.type || b?.benefitType || '').toUpperCase() || 'OTHER',
      amount_base: Number(b?.amountBase || b?.amount?.base || b?.value || 0),
      unit: String(b?.unit || ''),
      additional_information: String(b?.additionalInformation || b?.additional_information || ''),
      raw_response: b,
    }))

    try {
      await dbReplaceAggPlanBenefits(planDbId, benefits)
    } catch {}
    plansUpserted++
  }

  return {
    success: true,
    message: `Step 3 complete. Normalized ${opsInput.length} operators and ${plansUpserted} plans into staging by country ISO3. Countries: ${matchedCount} matched, ${unknownCount} unknown.`,
    data: {
      checked: rawOps.length,
      rawPlansFetched: rawPlans.length,
      matched: matchedCount,
      unknown: unknownCount,
      operatorsNormalized: opsInput.length,
      plansNormalized: plansUpserted,
      normalized: plansUpserted,
    },
  }
}
