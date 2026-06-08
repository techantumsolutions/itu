import { NextResponse } from 'next/server'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import {
  aggGetProvider,
  aggListProviders,
  aggUpsertRawOperator,
  aggUpsertRawPlan,
  aggUpsertSystemOperator,
  aggUpsertOperatorMapping,
  aggUpsertSystemPlan,
  aggUpsertPlanMapping,
  aggLoadTrustedOperators,
  aggLoadCatalogIntelligenceRegistries,
  aggInsertPlanClassificationAudit,
  aggInsertCatalogReviewQueue,
  aggInsertOperatorDomainAudit,
} from '@/lib/aggregator/repository'
import { CatalogIntelligenceEngine, isMobileTelecomDomain } from '@/lib/aggregator/catalog-intelligence'
import { classifyPlanDomain } from '@/lib/aggregator/catalog-intelligence/plan-domain'
import { resolvePlanServiceDomain } from '@/lib/aggregator/catalog-intelligence/segmentation'
import { getConnector } from '@/lib/providers/registry'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'
import { getOrCreateCanonicalCountry } from '@/lib/aggregator/country-normalizer'
import { buildSystemOperatorInput } from '@/lib/aggregator/operator-normalizer'
import { buildSystemPlanInput } from '@/lib/aggregator/plan-normalizer'
import { validateRawOperatorPlans, extractRawPlanFields } from '@/lib/aggregator/telecom-validator'
import { createOrGetInternalPlan } from '@/lib/aggregator/sync-service'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { sha256 } from '@/lib/aggregator/signature'
import {
  dbUpsertAggCountries,
  dbUpsertAggOperators,
  dbUpsertAggPlans,
  dbReplaceAggPlanBenefits,
} from '@/lib/db/agg-catalog'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

// Register iso countries
countries.registerLocale(enLocale)

function stringToBigInt(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return Math.abs(hash | 0)
}

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

function rawOperatorFromPlan(plan: any) {
  const raw: any = plan.raw ?? {}
  const operator = raw?.operator ?? {}
  const country = operator?.country ?? {}
  const providerOperatorId = String(operator?.id || plan.operatorRef || '')
  const providerOperatorName = String(operator?.name || plan.operatorName || plan.operatorRef || '')
  return {
    providerOperatorId,
    providerOperatorName,
    countryCode: String(country?.iso_code || plan.countryIso3 || '').toUpperCase(),
    isoCode: String(country?.iso_code || plan.countryIso3 || '').toUpperCase(),
    mobileCountryCode: String(country?.mobile_country_code || country?.mcc || '') || null,
    logo: String(operator?.logo || operator?.logo_url || '') || null,
    operatorType: String(operator?.type || plan.service || 'Mobile'),
    currency: String(raw?.prices?.retail?.unit || plan.retailCurrency || '') || null,
    rawResponseJson: operator && Object.keys(operator).length ? operator : { operatorRef: plan.operatorRef, operatorName: plan.operatorName },
  }
}

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { step, providerId } = body

    if (!step || !providerId) {
      return NextResponse.json({ error: 'Missing step or providerId' }, { status: 400 })
    }

    const providerRow = await aggGetProvider(providerId)
    if (!providerRow) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const config = rowToProviderConfig(providerRow as any)

    switch (step) {
      case 'step1_check': {
        const connector = getConnector(config.adapterKey)
        if (!connector) {
          return NextResponse.json({ success: false, message: `Adapter ${config.adapterKey} not registered.` })
        }
        return NextResponse.json({
          success: true,
          message: `Connection check succeeded. Provider "${config.code}" adapter is active and configured correctly.`
        })
      }

      case 'step2_fetch': {
        const connector = getConnector(config.adapterKey)
        const raw = await connector.fetchRawPlans(config, { countries: config.supportedCountries })
        const normalized = await connector.normalizePlans({ config, raw })

        // Clear existing raw plans/operators first
        await supabaseRest(`provider_plans_raw?provider_id=eq.${providerId}`, { method: 'DELETE' })
        await supabaseRest(`provider_operator_raw?service_provider_id=eq.${providerId}`, { method: 'DELETE' })

        const opIdMap = new Map<string, string>()
        let opsStored = 0
        let plansStored = 0

        // Store raw operators
        for (const plan of normalized) {
          const op = rawOperatorFromPlan(plan)
          if (!op.providerOperatorId) continue

          if (!opIdMap.has(op.providerOperatorId)) {
            const rawOp = await aggUpsertRawOperator({
              serviceProviderId: providerId,
              ...op,
              checksumHash: sha256(JSON.stringify(op.rawResponseJson)),
            })
            if (rawOp?.id) {
              opIdMap.set(op.providerOperatorId, rawOp.id)
              opsStored++
            }
          }
        }

        // Store raw plans
        for (const plan of normalized) {
          const opId = rawOperatorFromPlan(plan).providerOperatorId
          const dbOpId = opIdMap.get(opId)
          if (!dbOpId) continue

          const rawPlan = await aggUpsertRawPlan({
            providerId,
            providerPlanId: plan.providerPlanId,
            providerOperatorRawId: dbOpId,
            providerPlanName: plan.name ?? null,
            providerPlanCode: plan.providerPlanId,
            amount: plan.retailAmount ?? plan.destinationAmount ?? null,
            currency: plan.retailCurrency ?? null,
            validity: plan.validityDays ? `${plan.validityDays}D` : null,
            talktime: null,
            dataVolume: null,
            sms: null,
            description: plan.description ?? null,
            planType: plan.planType ?? null,
            benefitsJson: plan.benefits,
            rawJson: plan.raw,
            checksumHash: sha256(JSON.stringify(plan.raw)),
            status: 'active',
          })
          if (rawPlan?.id) {
            plansStored++
          }
        }

        return NextResponse.json({
          success: true,
          message: `Stored raw data in DB. Stored ${opsStored} raw operators and ${plansStored} raw plans.`
        })
      }

      case 'step3_countries': {
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

        return NextResponse.json({
          success: true,
          message: `Normalized country ISO data. Checked ${rawOps.length} operators and updated ${normalizedCount} canonical country matches.`
        })
      }

      case 'step4_normalize': {
        const { trustedOperators, domainRegistry, nonTelecomRegistry } = await aggLoadCatalogIntelligenceRegistries().catch(() => ({
          trustedOperators: [],
          domainRegistry: [],
          nonTelecomRegistry: [],
        }))
        const catalogEngine = new CatalogIntelligenceEngine(trustedOperators, domainRegistry, nonTelecomRegistry)

        // Clear previous staging catalog tables for this provider code
        await supabaseRest(`agg_plans?provider=eq.${config.code}`, { method: 'DELETE' })
        await supabaseRest(`agg_operators?provider=eq.${config.code}`, { method: 'DELETE' })

        // Load raw data
        const opsRes = await supabaseRest(`provider_operator_raw?service_provider_id=eq.${providerId}&select=*`, { cache: 'no-store' })
        const rawOps = await opsRes.json().catch(() => []) as any[]

        const plansRes = await supabaseRest(`provider_plans_raw?provider_id=eq.${providerId}&select=*`, { cache: 'no-store' })
        const rawPlans = await plansRes.json().catch(() => []) as any[]

        // First upsert countries to agg_countries to satisfy foreign key constraints
        const countryMap = new Map<string, { iso3: string; iso2?: string; name: string; raw_response: any }>()
        for (const op of rawOps) {
          const rawCountry = op.raw_response_json?.country || op.raw_response_json || {}
          const iso3 = String(op.iso_code || op.country_code || rawCountry.iso_code || 'UNK').toUpperCase()
          const code3 = iso3.length === 3 ? iso3 : countries.alpha2ToAlpha3(iso3) || 'UNK'
          const name = rawCountry.name || countries.getName(code3, 'en') || `Country ${code3}`
          
          if (code3 !== 'UNK') {
            countryMap.set(code3, {
              iso3: code3,
              iso2: countries.alpha3ToAlpha2(code3) || undefined,
              name,
              raw_response: rawCountry,
            })
          }
        }
        
        if (countryMap.size > 0) {
          await dbUpsertAggCountries(Array.from(countryMap.values()))
        }

        const validCountries = new Set(countryMap.keys())
        const operatorDomainByAggId = new Map<number, ReturnType<typeof catalogEngine.evaluateOperatorDomain>>()
        const operatorPlansByAggId = new Map<number, unknown[]>()

        for (const rp of rawPlans) {
          const rawOp = rawOps.find((o) => o.id === rp.provider_operator_raw_id)
          if (!rawOp) continue
          const aggOpId = stringToBigInt(rawOp.provider_operator_id)
          if (!operatorPlansByAggId.has(aggOpId)) operatorPlansByAggId.set(aggOpId, [])
          operatorPlansByAggId.get(aggOpId)!.push(rp.raw_json || {})
        }

        const opsInput = rawOps.map((op) => {
          const iso3 = String(op.iso_code || op.country_code || 'UNK').toUpperCase()
          const aggOpId = stringToBigInt(op.provider_operator_id)
          const domainEval = catalogEngine.evaluateOperatorDomain({
            operatorName: op.provider_operator_name,
            countryCode: iso3.length === 3 ? iso3 : countries.alpha2ToAlpha3(iso3) || iso3,
            rawPlans: operatorPlansByAggId.get(aggOpId) || [],
          })
          operatorDomainByAggId.set(aggOpId, domainEval)
          return {
            provider: config.code as any,
            aggregator_operator_id: aggOpId,
            country_iso3: iso3.length === 3 ? iso3 : countries.alpha2ToAlpha3(iso3) || 'UNK',
            name: op.provider_operator_name,
            regions: [],
            raw_response: op.raw_response_json,
            service_domain: domainEval.domain,
            service_domain_confidence: domainEval.confidence,
            service_domain_source: domainEval.classificationSource,
            operator_domain: domainEval.domain,
            operator_domain_confidence: domainEval.confidence,
            domain_classification_source: domainEval.classificationSource,
          }
        }).filter((o) => validCountries.has(o.country_iso3))

        const upsertedOps = await dbUpsertAggOperators(opsInput)
        const opIdMap = new Map<number, string>()
        for (const row of upsertedOps ?? []) {
          opIdMap.set(Number(row.aggregator_operator_id), row.id)
        }

        let plansUpserted = 0
        const plansInput = rawPlans.map((rp) => {
          // Find matching raw operator to get aggregator_operator_id
          const rawOp = rawOps.find((o) => o.id === rp.provider_operator_raw_id)
          if (!rawOp) return null

          const aggOpId = stringToBigInt(rawOp.provider_operator_id)
          const dbOpUuid = opIdMap.get(aggOpId)
          if (!dbOpUuid) return null
          const domainEval = operatorDomainByAggId.get(aggOpId)
          const planDomainEval = classifyPlanDomain(rp.raw_json || {}, rawOp.provider_operator_name)
          const segment = domainEval
            ? resolvePlanServiceDomain({ operatorEvaluation: domainEval, planEvaluation: planDomainEval })
            : null

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
            service_domain: segment?.serviceDomain ?? domainEval?.domain ?? 'UNKNOWN',
            service_domain_confidence: segment?.confidence ?? domainEval?.confidence ?? 0,
            service_domain_source: segment?.source ?? domainEval?.classificationSource ?? 'unknown',
          }
        }).filter(Boolean) as any[]

        const upsertedPlans = await dbUpsertAggPlans(plansInput)
        const planIdByAggId = new Map<number, string>()
        for (const row of upsertedPlans ?? []) {
          planIdByAggId.set(Number(row.aggregator_plan_id), row.id)
        }

        // Add benefits
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

        return NextResponse.json({
          success: true,
          message: `Staging normalization complete. Loaded ${opsInput.length} operators and ${plansUpserted} plans into agg staging tables.`
        })
      }

      case 'step5_filter_telecom': {
        const { trustedOperators, domainRegistry, nonTelecomRegistry } = await aggLoadCatalogIntelligenceRegistries().catch(() => ({
          trustedOperators: [],
          domainRegistry: [],
          nonTelecomRegistry: [],
        }))
        const catalogEngine = new CatalogIntelligenceEngine(trustedOperators, domainRegistry, nonTelecomRegistry)
        const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}&status=eq.active`, { cache: 'no-store' })
        const aggOps = await opsRes.json().catch(() => []) as any[]

        let activeCount = 0
        let inactiveCount = 0
        let reviewCount = 0
        let mobileCount = 0

        for (const op of aggOps) {
          const plansRes = await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, { cache: 'no-store' })
          const aggPlans = await plansRes.json().catch(() => []) as any[]

          const validatorPlans = aggPlans.map((p) => ({
            raw: p.raw_response || {},
            benefits: Array.isArray(p.raw_response?.benefits || p.raw_response?.Benefits)
              ? (p.raw_response?.benefits || p.raw_response?.Benefits)
              : []
          })) as any[]

          const operatorName = op.operator_name || op.name
          const domainEval = catalogEngine.evaluateOperatorDomain({
            operatorName,
            countryCode: op.country_iso3,
            rawPlans: validatorPlans.map((p) => p.raw),
          })

          await supabaseRest(`agg_operators?id=eq.${op.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              operator_domain: domainEval.domain,
              operator_domain_confidence: domainEval.confidence,
              domain_classification_source: domainEval.classificationSource,
            }),
          }).catch(() => {})

          await aggInsertOperatorDomainAudit({
            operatorId: String(op.id),
            operatorName,
            providerCode: config.code,
            detectedDomain: domainEval.domain,
            confidence: domainEval.confidence,
            classificationSource: domainEval.classificationSource,
            matchedRules: domainEval.matchedRules,
            matchedKeywords: domainEval.matchedKeywords,
            rejectionReason: domainEval.rejectionReason ?? null,
            domainBreakdown: domainEval.domainBreakdown,
          }).catch(() => {})

          const validation = validateRawOperatorPlans(validatorPlans, {
            operatorName,
            countryCode: op.country_iso3,
            engine: catalogEngine,
          })

          if (isMobileTelecomDomain(domainEval.domain) && validation.passed) {
            activeCount++
            mobileCount++
          } else if (domainEval.isBlockedFromTelecom || !isMobileTelecomDomain(domainEval.domain)) {
            await supabaseRest(`agg_operators?id=eq.${op.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'inactive' }),
            })
            await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'inactive' }),
            })
            inactiveCount++
          } else if (validation.promotion?.shouldDeactivate) {
            await supabaseRest(`agg_operators?id=eq.${op.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'inactive' }),
            })
            await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'inactive' }),
            })
            inactiveCount++
          } else {
            reviewCount++
            activeCount++
          }
        }

        return NextResponse.json({
          success: true,
          message: `Filter 1 (Domain + Catalog Intelligence) applied. Evaluated ${aggOps.length} staging operators. Mobile/Telecom active: ${mobileCount}, Review/Uncertain: ${reviewCount}, Excluded non-mobile: ${inactiveCount}.`,
        })
      }

      case 'step6_merge': {
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

        return NextResponse.json({
          success: true,
          message: `Filter 2 (Consolidation Name Merging) applied. Consolidate-merged ${totalMerged} duplicate operators in staging.`
        })
      }

      case 'step7_promote': {
        const { trustedOperators, domainRegistry, nonTelecomRegistry } = await aggLoadCatalogIntelligenceRegistries().catch(() => ({
          trustedOperators: [],
          domainRegistry: [],
          nonTelecomRegistry: [],
        }))
        const catalogEngine = new CatalogIntelligenceEngine(trustedOperators, domainRegistry, nonTelecomRegistry)
        const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}&status=eq.active`, { cache: 'no-store' })
        const aggOps = await opsRes.json().catch(() => []) as any[]

        let promotedOps = 0
        let promotedPlans = 0
        let skippedNonMobile = 0

        for (const op of aggOps) {
          const plansRes = await supabaseRest(`agg_plans?operator_id=eq.${op.id}&status=eq.active&service_domain=eq.MOBILE`, { cache: 'no-store' })
          const aggPlans = (await plansRes.json().catch(() => [])) as any[]

          if (aggPlans.length === 0) {
            await supabaseRest(`agg_operators?id=eq.${op.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'inactive' }),
            })
            continue
          }

          const domainEval = catalogEngine.evaluateOperatorDomain({
            operatorName: op.name,
            countryCode: op.country_iso3,
            rawPlans: aggPlans.map((p) => p.raw_response || {}),
          })

          if (!isMobileTelecomDomain(domainEval.domain)) {
            skippedNonMobile++
            await supabaseRest(`agg_operators?id=eq.${op.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'inactive',
                operator_domain: domainEval.domain,
                operator_domain_confidence: domainEval.confidence,
                domain_classification_source: domainEval.classificationSource,
              }),
            }).catch(() => {})
            await aggInsertOperatorDomainAudit({
              operatorId: String(op.id),
              operatorName: op.name,
              providerCode: config.code,
              detectedDomain: domainEval.domain,
              confidence: domainEval.confidence,
              classificationSource: domainEval.classificationSource,
              matchedRules: domainEval.matchedRules,
              matchedKeywords: domainEval.matchedKeywords,
              rejectionReason: domainEval.rejectionReason ?? `NON_MOBILE_DOMAIN:${domainEval.domain}`,
              domainBreakdown: domainEval.domainBreakdown,
            }).catch(() => {})
            continue
          }

          // Build fake plan matching standard provider raw operators mapper
          const testPlan = {
            providerId,
            providerCode: config.code,
            countryIso3: op.country_iso3,
            operatorName: op.name,
            operatorRef: `system_promote:${op.id}`,
            service: aggPlans[0].type || 'Mobile',
            raw: op.raw_response,
          } as any

          // Promoted System Operator
          const systemOperatorInput = buildSystemOperatorInput(testPlan, op.name)
          systemOperatorInput.operatorDomain = domainEval.domain
          systemOperatorInput.operatorDomainConfidence = domainEval.confidence
          systemOperatorInput.domainClassificationSource = domainEval.classificationSource
          systemOperatorInput.serviceDomain = 'MOBILE'
          systemOperatorInput.serviceDomainConfidence = domainEval.confidence
          systemOperatorInput.serviceDomainSource = domainEval.classificationSource
          const systemOperator = await aggUpsertSystemOperator(systemOperatorInput)
          if (!systemOperator?.id) continue

          promotedOps++

          // Storing mappings
          // Resolve providerOperatorRawId
          const rawOpRes = await supabaseRest(`provider_operator_raw?service_provider_id=eq.${providerId}&provider_operator_name=eq.${encodeURIComponent(op.name)}&limit=1`, { cache: 'no-store' })
          const rawOpRows = await rawOpRes.json().catch(() => []) as any[]
          const rawOpId = rawOpRows[0]?.id

          if (rawOpId) {
            await aggUpsertOperatorMapping({
              serviceProviderId: providerId,
              providerOperatorRawId: rawOpId,
              systemOperatorId: systemOperator.id,
              mappingConfidence: 100,
              mappingType: 'AUTO',
              isVerified: false,
            })
          }

          for (const plan of aggPlans) {
            // Promoting plans
            const fields = extractRawPlanFields(plan.raw_response)
            const serviceStr = fields.serviceName || (plan.type === 'DATA' || String(plan.type).toUpperCase().includes('DATA') ? 'Data' : 'Mobile')
            const subserviceStr = fields.subserviceName || undefined

            const normalizedPlanForUpsert = {
              providerId,
              providerCode: config.code,
              providerPlanId: String(plan.aggregator_plan_id),
              countryIso3: op.country_iso3,
              operatorRef: `system:${systemOperator.id}`,
              operatorName: op.name,
              service: serviceStr,
              subservice: subserviceStr,
              name: plan.name,
              description: plan.description || '',
              category: plan.type,
              subcategory: '',
              planType: plan.type,
              benefits: [], // System plans will be enriched/filtered next
              requiredFields: [],
              retailAmount: plan.retail_amount || 0,
              retailCurrency: plan.currency_unit || 'USD',
              raw: plan.raw_response || {}
            } as any

            const internal = await createOrGetInternalPlan(normalizedPlanForUpsert)
            if (!internal.plan?.id) continue

            const systemPlan = await aggUpsertSystemPlan(
              buildSystemPlanInput({
                plan: normalizedPlanForUpsert,
                systemOperatorId: systemOperator.id,
                internalPlanId: internal.plan.id,
              })
            )

            if (systemPlan?.id) {
              promotedPlans++

              // Link mappings
              const rawPlanRes = await supabaseRest(`provider_plans_raw?provider_id=eq.${providerId}&provider_plan_id=eq.${plan.aggregator_plan_id}&limit=1`, { cache: 'no-store' })
              const rawPlanRows = await rawPlanRes.json().catch(() => []) as any[]
              const rawPlanId = rawPlanRows[0]?.id

              if (rawPlanId) {
                await aggUpsertPlanMapping({
                  serviceProviderId: providerId,
                  providerPlanRawId: rawPlanId,
                  systemPlanId: systemPlan.id,
                  matchingScore: 100,
                  matchingReason: 'Promoted step staging match',
                  isVerified: false,
                })
              }
            }
          }
        }

        return NextResponse.json({
          success: true,
          message: `Staging promotion complete. Promoted ${promotedOps} MOBILE operators and ${promotedPlans} system plans. Skipped ${skippedNonMobile} non-mobile domain operators.`,
        })
      }

      case 'step8_filter_benefits': {
        const trustedOperators = await aggLoadTrustedOperators().catch(() => [])
        const catalogEngine = new CatalogIntelligenceEngine(trustedOperators)
        const mappingsRes = await supabaseRest(`plan_mappings?service_provider_id=eq.${providerId}&select=system_plan_id,provider_plan_raw_id`, { cache: 'no-store' })
        const mappings = await mappingsRes.json().catch(() => []) as any[]

        let quarantinedPlans = 0
        let reviewPlans = 0
        let activePlans = 0

        for (const map of mappings) {
          const sysPlanId = map.system_plan_id
          const rawPlanId = map.provider_plan_raw_id

          const rawPlanRes = await supabaseRest(`provider_plans_raw?id=eq.${rawPlanId}&limit=1`, { cache: 'no-store' })
          const rawPlanRows = await rawPlanRes.json().catch(() => []) as any[]
          const rawPlan = rawPlanRows[0]

          if (!rawPlan) continue

          const planIntel = catalogEngine.classifyRawPlan({
            raw: rawPlan.raw_json || rawPlan,
            providerCategory: rawPlan.plan_type,
          })

          await supabaseRest(`provider_plans_raw?id=eq.${rawPlanId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              catalog_status: planIntel.catalogStatus,
              confidence_level: planIntel.confidenceLevel,
              confidence_score: planIntel.confidenceScore,
              status: planIntel.catalogStatus === 'ACTIVE' ? 'active' : planIntel.catalogStatus.toLowerCase(),
            }),
          }).catch(() => {})

          await aggInsertPlanClassificationAudit({
            providerCode: config.code,
            providerPlanRawId: rawPlanId,
            providerPlanId: rawPlan.provider_plan_id,
            classification: planIntel.confidenceLevel,
            confidenceLevel: planIntel.confidenceLevel,
            confidenceScore: planIntel.confidenceScore,
            catalogStatus: planIntel.catalogStatus,
            matchedKeywords: planIntel.matchedKeywords,
            confidenceBreakdown: planIntel.layerScores,
            rejectionReason: planIntel.rejectionReason ?? null,
          }).catch(() => {})

          const systemPatch = {
            catalog_status: planIntel.catalogStatus,
            confidence_level: planIntel.confidenceLevel,
            confidence_score: planIntel.confidenceScore,
            status: planIntel.catalogStatus === 'NON_TELECOM' ? 'INACTIVE' : 'ACTIVE',
          }
          await supabaseRest(`system_plans?id=eq.${sysPlanId}`, {
            method: 'PATCH',
            body: JSON.stringify(systemPatch),
          }).catch(() => {})

          if (planIntel.catalogStatus === 'NON_TELECOM' || planIntel.catalogStatus === 'QUARANTINED') {
            quarantinedPlans++
            if (planIntel.shouldQuarantine) {
              await aggInsertCatalogReviewQueue({
                providerCode: config.code,
                providerPlanRawId: rawPlanId,
                providerPlanId: rawPlan.provider_plan_id,
                entityType: 'plan',
                entityName: rawPlan.provider_plan_name || rawPlan.provider_plan_id,
                confidenceLevel: planIntel.confidenceLevel,
                confidenceScore: planIntel.confidenceScore,
                classification: planIntel.confidenceLevel,
                catalogStatus: planIntel.catalogStatus,
                rawPayload: rawPlan.raw_json,
                notes: planIntel.rejectionReason ?? null,
              }).catch(() => {})
            }
          } else if (planIntel.catalogStatus === 'REVIEW') {
            reviewPlans++
          } else {
            activePlans++
          }
        }

        return NextResponse.json({
          success: true,
          message: `Step 8 complete. Soft catalog filtering applied. Active: ${activePlans}, Review: ${reviewPlans}, Quarantined/Non-telecom: ${quarantinedPlans}. No plans were deleted.`
        })
      }

      default:
        return NextResponse.json({ error: `Invalid step: ${step}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[sync-step] Error executing step:', error)
    return NextResponse.json({ error: error.message || 'Execution failed' }, { status: 500 })
  }
}
