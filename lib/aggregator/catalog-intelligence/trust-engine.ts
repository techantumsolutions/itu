import { supabaseRest } from '@/lib/db/supabase-rest'
import { normalizeOperatorForRegistry } from './brand-intelligence'

export type TrustEvaluationResult = {
  matched: boolean
  trustScore: number
  trustLevel: string
  canonicalOperatorId: string | null
  matchSource: string
  reasons: string[]
}

export class OperatorTrustEngine {
  /** Calculate trust score (0-100) and return trust level and reasons */
  static async evaluateTrust(
    operatorName: string,
    countryCode?: string | null,
    syncRunId?: string
  ): Promise<TrustEvaluationResult> {
    const normalized = normalizeOperatorForRegistry(operatorName)
    if (!normalized) {
      return {
        matched: false,
        trustScore: 0,
        trustLevel: 'UNKNOWN',
        canonicalOperatorId: null,
        matchSource: 'UNKNOWN',
        reasons: ['empty_operator_name']
      }
    }

    const country = ((countryCode ?? '*').trim().toUpperCase()) || '*'
    const reasons: string[] = []
    let score = 0
    let matchSource = 'UNKNOWN'
    let canonicalOperatorId: string | null = null

    // 1. Check for system_operators exact match
    let systemOpMatch: any = null
    try {
      const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const res = await supabaseRest(
        `system_operators?country_id=eq.${encodeURIComponent(country)}&or=(slug.eq.${encodeURIComponent(slug)},system_operator_name.ilike.${encodeURIComponent(normalized)})&limit=1`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const rows = await res.json() as any[]
        if (rows && rows.length > 0) {
          systemOpMatch = rows[0]
          canonicalOperatorId = systemOpMatch.id
        }
      }
    } catch (err) {
      console.error('[TrustEngine] Failed system operator check:', err)
    }

    // 2. Check for alias matches in operator_aliases
    let aliasMatch: any = null
    try {
      const res = await supabaseRest(
        `operator_aliases?alias_name=eq.${encodeURIComponent(normalized)}&country_code=in.(${encodeURIComponent(country)},*)&limit=1`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const rows = await res.json() as any[]
        if (rows && rows.length > 0) {
          aliasMatch = rows[0]
          canonicalOperatorId = aliasMatch.canonical_operator_id || canonicalOperatorId
        }
      }
    } catch (err) {
      console.error('[TrustEngine] Failed alias check:', err)
    }

    // 3. Check trust registry matches
    let registryMatch: any = null
    try {
      const res = await supabaseRest(
        `operator_trust_registry?normalized_name=eq.${encodeURIComponent(normalized)}&country_code=in.(${encodeURIComponent(country)},*)&limit=1`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const rows = await res.json() as any[]
        if (rows && rows.length > 0) {
          registryMatch = rows[0]
          canonicalOperatorId = registryMatch.canonical_operator_id || canonicalOperatorId
        }
      }
    } catch (err) {
      console.error('[TrustEngine] Failed registry check:', err)
    }

    // 4. Check historical/consensus matches
    let historyMatch: any = null
    if (canonicalOperatorId) {
      try {
        const res = await supabaseRest(
          `operator_history?canonical_operator_id=eq.${encodeURIComponent(canonicalOperatorId)}&limit=1`,
          { cache: 'no-store' }
        )
        if (res.ok) {
          const rows = await res.json() as any[]
          if (rows && rows.length > 0) {
            historyMatch = rows[0]
          }
        }
      } catch (err) {
        console.error('[TrustEngine] Failed history check:', err)
      }
    }

    // ----------------------------------------------------
    // SCORING ENGINE RULES
    // ----------------------------------------------------

    // Rule A: Existing verified system operator (+40)
    if (systemOpMatch && systemOpMatch.is_verified_telecom) {
      score += 40
      matchSource = 'SYSTEM_OPERATOR'
      reasons.push('existing_verified_system_operator')
    }

    // Rule B: Alias match (+30)
    if (aliasMatch) {
      score += 30
      matchSource = 'ALIAS_MATCH'
      reasons.push('alias_engine_match')
    }

    // Rule C: Trust registry manual verifications / promotion (+50 / +15)
    if (registryMatch) {
      if (registryMatch.is_verified || registryMatch.manual_override) {
        score += 50
        matchSource = 'ADMIN_APPROVED'
        reasons.push('manual_registry_verification')
      } else if (registryMatch.source === 'PROMOTION') {
        score += 15
        matchSource = 'PROMOTION'
        reasons.push('historical_promotion_source')
      } else {
        score += 10
        matchSource = 'TRUST_REGISTRY'
        reasons.push('registry_entry_present')
      }
      // Seen in multiple providers (+20)
      if (registryMatch.provider_count > 1) {
        score += 20
        reasons.push('provider_consensus_matched')
      }
    }

    // Rule D: Historical data check
    if (historyMatch) {
      // Historical telecom plans (+20)
      if (historyMatch.telecom_plan_count > 0) {
        score += 20
        reasons.push('historical_telecom_plans_present')
      }
      // Historical promotions (+15)
      if (historyMatch.promotion_count > 0) {
        score += 15
        reasons.push('historical_promotions_present')
      }
    }

    // Rule E: Blocker / Negative checks
    const nameTokens = normalized.split(' ')
    let hasRetailKeyword = false
    let hasOttKeyword = false
    let hasNonTelecomEvidence = false

    // Fetch dynamic block keywords
    try {
      const res = await supabaseRest('operator_block_keywords?is_active=eq.true&limit=1000', { cache: 'no-store' })
      if (res.ok) {
        const blockers = await res.json() as any[]
        for (const token of nameTokens) {
          const matchedBlocker = blockers.find(b => b.keyword.trim().toUpperCase() === token)
          if (matchedBlocker) {
            const cat = matchedBlocker.category.trim().toUpperCase()
            if (['RETAIL', 'GAMING', 'GIFTCARD'].includes(cat)) {
              hasRetailKeyword = true
            } else if (['OTT', 'STREAMING'].includes(cat)) {
              hasOttKeyword = true
            } else {
              hasNonTelecomEvidence = true
            }
          }
        }
      }
    } catch (err) {
      console.error('[TrustEngine] Blocker keywords fetch failed:', err)
    }

    // Apply negative scores:
    // Retail/Gaming indicators (-20)
    if (hasRetailKeyword) {
      score -= 20
      reasons.push('negative_signal:retail_gaming_indicators')
    }
    // OTT indicators (-15)
    if (hasOttKeyword) {
      score -= 15
      reasons.push('negative_signal:ott_indicators')
    }
    // Repeated non-telecom evidence (-30)
    if (hasNonTelecomEvidence || (systemOpMatch && systemOpMatch.operator_type === 'NON_TELECOM')) {
      score -= 30
      reasons.push('negative_signal:repeated_non_telecom_evidence')
    }

    // Bound the final score between 0 and 100
    const finalScore = Math.max(0, Math.min(100, score))

    // Trust Levels:
    // 90+ VERIFIED
    // 70-89 TRUSTED
    // 50-69 REVIEW
    // 0-49 UNKNOWN
    let trustLevel = 'UNKNOWN'
    if (finalScore >= 90) {
      trustLevel = 'VERIFIED'
    } else if (finalScore >= 70) {
      trustLevel = 'TRUSTED'
    } else if (finalScore >= 50) {
      trustLevel = 'REVIEW'
    }

    // Record audit trails asynchronously
    await this.recordAudit({
      operatorName,
      countryCode,
      canonicalOperatorId,
      trustScore: finalScore,
      trustLevel,
      matchSource,
      reasonJson: { scoreBreakdown: reasons, rawScore: score },
      syncRunId
    }).catch(err => {
      console.error('[TrustEngine] Failed to write audit trail:', err)
    })

    return {
      matched: finalScore >= 70, // Matches if VERIFIED or TRUSTED
      trustScore: finalScore,
      trustLevel,
      canonicalOperatorId,
      matchSource,
      reasons
    }
  }

  /** Record trust decision audit logs */
  static async recordAudit(params: {
    operatorName: string
    countryCode?: string | null
    canonicalOperatorId: string | null
    trustScore: number
    trustLevel: string
    matchSource: string
    reasonJson: any
    syncRunId?: string
  }): Promise<void> {
    await supabaseRest('operator_trust_audit', {
      method: 'POST',
      body: JSON.stringify({
        operator_name: params.operatorName,
        country_code: params.countryCode || '*',
        canonical_operator_id: params.canonicalOperatorId,
        trust_score: params.trustScore,
        trust_level: params.trustLevel,
        match_source: params.matchSource,
        reason_json: params.reasonJson,
        sync_run_id: params.syncRunId
      })
    })
  }

  /** self-learning approved operator */
  static async learnFromAdminApproval(
    canonicalOperatorId: string,
    operatorName: string,
    countryCode: string,
    actorEmail: string
  ): Promise<void> {
    const normalized = normalizeOperatorForRegistry(operatorName)
    if (!normalized) return

    // 1. Update system_operators status
    await supabaseRest(`system_operators?id=eq.${encodeURIComponent(canonicalOperatorId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        is_verified_telecom: true,
        trust_level: 'VERIFIED',
        telecom_confidence: 98,
        verification_source: 'ADMIN_APPROVED',
        verified_at: new Date().toISOString()
      })
    })

    // 2. Add or update operator_trust_registry
    await supabaseRest('operator_trust_registry', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        canonical_operator_id: canonicalOperatorId,
        normalized_name: normalized,
        display_name: operatorName,
        country_code: countryCode,
        trust_score: 99,
        is_verified: true,
        source: 'ADMIN_APPROVED',
        updated_at: new Date().toISOString()
      })
    })

    // 3. Create alias
    await this.learnFromAliasMapping(canonicalOperatorId, operatorName, countryCode, 'ADMIN_APPROVED')
  }

  /** dynamic alias engine mapping */
  static async learnFromAliasMapping(
    canonicalOperatorId: string,
    aliasName: string,
    countryCode: string,
    source: string
  ): Promise<void> {
    const normalized = normalizeOperatorForRegistry(aliasName)
    if (!normalized) return

    await supabaseRest('operator_aliases', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        canonical_operator_id: canonicalOperatorId,
        alias_name: aliasName,
        normalized_alias: normalized,
        country_code: countryCode,
        confidence_score: 95,
        source: source,
        updated_at: new Date().toISOString()
      })
    })
  }

  /** learn provider promotion consensus */
  static async learnFromPromotion(
    canonicalOperatorId: string,
    operatorName: string,
    countryCode: string,
    providerId: string,
    telecomPlanCount: number,
    activePlanCount: number
  ): Promise<void> {
    const normalized = normalizeOperatorForRegistry(operatorName)
    if (!normalized) return

    // Update history table
    try {
      const histRes = await supabaseRest(
        `operator_history?canonical_operator_id=eq.${encodeURIComponent(canonicalOperatorId)}&provider_id=eq.${encodeURIComponent(providerId)}&limit=1`,
        { cache: 'no-store' }
      )
      
      let existingHist: any = null
      if (histRes.ok) {
        const rows = await histRes.json() as any[]
        if (rows && rows.length > 0) {
          existingHist = rows[0]
        }
      }

      if (existingHist) {
        await supabaseRest(`operator_history?id=eq.${encodeURIComponent(existingHist.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            sync_count: existingHist.sync_count + 1,
            telecom_plan_count: existingHist.telecom_plan_count + telecomPlanCount,
            active_plan_count: existingHist.active_plan_count + activePlanCount,
            promotion_count: existingHist.promotion_count + 1,
            last_seen_at: new Date().toISOString()
          })
        })
      } else {
        await supabaseRest('operator_history', {
          method: 'POST',
          body: JSON.stringify({
            canonical_operator_id: canonicalOperatorId,
            provider_id: providerId,
            sync_count: 1,
            telecom_plan_count: telecomPlanCount,
            active_plan_count: activePlanCount,
            promotion_count: 1,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString()
          })
        })
      }
    } catch (err) {
      console.error('[TrustEngine] Failed historical promotion learning:', err)
    }

    // Query all history records for this operator to learn consensus
    try {
      const histAllRes = await supabaseRest(
        `operator_history?canonical_operator_id=eq.${encodeURIComponent(canonicalOperatorId)}`,
        { cache: 'no-store' }
      )
      if (histAllRes.ok) {
        const historyRecords = await histAllRes.json() as any[]
        const uniqueProviders = new Set(historyRecords.map(r => r.provider_id)).size
        const totalSyncCount = historyRecords.reduce((sum, r) => sum + r.sync_count, 0)

        // Update trust registry metrics
        await supabaseRest('operator_trust_registry', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            canonical_operator_id: canonicalOperatorId,
            normalized_name: normalized,
            display_name: operatorName,
            country_code: countryCode,
            trust_score: Math.min(90, 40 + (uniqueProviders > 1 ? 20 : 0) + Math.min(30, totalSyncCount)),
            source: 'PROMOTION',
            provider_count: uniqueProviders,
            sync_count: totalSyncCount,
            last_seen_at: new Date().toISOString()
          })
        })
      }
    } catch (err) {
      console.error('[TrustEngine] Failed provider consensus updates:', err)
    }
  }
}
