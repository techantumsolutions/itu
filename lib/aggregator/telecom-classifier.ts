import { supabaseRest } from '@/lib/db/supabase-rest'
import { NormalizedPlan } from '@/lib/providers/types'

export type OperatorClassificationResult = {
  classification: 'TELECOM' | 'RETAIL' | 'GIFT_CARD' | 'UTILITY' | 'STREAMING' | 'GAMING' | 'FINANCIAL' | 'WALLET' | 'UNKNOWN'
  confidence: number
  reasonCode: string
}

export function classifyOperatorKeywords(input: {
  operatorName: string
  planNames: string[]
  categories: string[]
  subcategories: string[]
}): OperatorClassificationResult {
  const opName = input.operatorName.toLowerCase()
  const allTexts = [
    opName,
    ...input.planNames.map(n => n.toLowerCase()),
    ...input.categories.map(c => c.toLowerCase()),
    ...input.subcategories.map(s => s.toLowerCase())
  ]

  let telecomScore = 0
  let retailScore = 0
  let giftCardScore = 0
  let gamingScore = 0
  let streamingScore = 0
  let utilityScore = 0
  let walletScore = 0

  const telecomKeywords = ['telecom', 'mobile', 'wireless', 'cellular', 'calling', 'voice', 'sms', 'airtime', 'topup', 'recharge', 'data', 'bundle', 'carrier', 'network']
  const retailKeywords = ['retail', 'shopping', 'store', 'amazon', 'ebay', 'walmart', 'target', 'nike', 'starbucks', 'kfc', 'domino']
  const giftCardKeywords = ['gift card', 'giftcard', 'gift voucher', 'voucher', 'coupon', 'play store', 'app store', 'itunes', 'google play']
  const gamingKeywords = ['gaming', 'game', 'token', 'credits', 'xbox', 'playstation', 'nintendo', 'steam', 'roblox', 'pubg', 'free fire', 'minecraft', 'razer']
  const streamingKeywords = ['netflix', 'spotify', 'ott', 'streaming', 'crunchyroll', 'disney', 'hulu', 'prime video']
  const utilityKeywords = ['electricity', 'water', 'gas', 'utility', 'utilities', 'broadband', 'landline']
  const walletKeywords = ['wallet', 'cash transfer', 'remittance', 'money transfer', 'ewallet', 'e-wallet']

  for (const text of allTexts) {
    if (telecomKeywords.some(kw => text.includes(kw))) telecomScore += 10
    if (retailKeywords.some(kw => text.includes(kw))) retailScore += 10
    if (giftCardKeywords.some(kw => text.includes(kw))) giftCardScore += 10
    if (gamingKeywords.some(kw => text.includes(kw))) gamingScore += 10
    if (streamingKeywords.some(kw => text.includes(kw))) streamingScore += 10
    if (utilityKeywords.some(kw => text.includes(kw))) utilityScore += 10
    if (walletKeywords.some(kw => text.includes(kw))) walletScore += 10
  }

  const scores = [
    { category: 'TELECOM', score: telecomScore },
    { category: 'RETAIL', score: retailScore },
    { category: 'GIFT_CARD', score: giftCardScore },
    { category: 'GAMING', score: gamingScore },
    { category: 'STREAMING', score: streamingScore },
    { category: 'UTILITY', score: utilityScore },
    { category: 'WALLET', score: walletScore }
  ]

  const sorted = scores.sort((a, b) => b.score - a.score)
  const top = sorted[0]
  if (top.score > 0) {
    const totalScore = scores.reduce((sum, item) => sum + item.score, 0)
    const confidence = Math.min(0.99, Math.max(0.5, top.score / totalScore))
    return {
      classification: top.category as any,
      confidence,
      reasonCode: 'KEYWORD_CLASSIFICATION'
    }
  }

  return {
    classification: 'UNKNOWN',
    confidence: 0.0,
    reasonCode: 'REJECT_LOW_CONFIDENCE'
  }
}

export async function classifyOperator(
  providerCode: string,
  providerOperatorId: string,
  operatorName: string,
  countryCode: string,
  plans: NormalizedPlan[],
  capabilities?: string[]
): Promise<OperatorClassificationResult> {
  const normName = operatorName.trim().toUpperCase()

  // Step 1: Manual Review Overrides / Rules
  try {
    const rulesRes = await supabaseRest(`classification_rules?pattern=ilike.%${encodeURIComponent(normName)}%&is_active=eq.true&limit=1`, { cache: 'no-store' })
    if (rulesRes.ok) {
      const rules = await rulesRes.json()
      if (rules && rules.length > 0) {
        return {
          classification: rules[0].classification as any,
          confidence: 1.0,
          reasonCode: 'MANUAL_RULE_OVERRIDE'
        }
      }
    }
  } catch (err) {
    console.error('Failed to query classification_rules:', err)
  }

  // Step 2: Telecom Reference Catalog
  try {
    const catRes = await supabaseRest(`telecom_reference_catalog?operator_name=eq.${encodeURIComponent(normName)}&limit=1`, { cache: 'no-store' })
    if (catRes.ok) {
      const cat = await catRes.json()
      if (cat && cat.length > 0) {
        return {
          classification: cat[0].classification as any,
          confidence: 0.98,
          reasonCode: 'TELECOM_REFERENCE_CATALOG'
        }
      }
    }
  } catch (err) {
    console.error('Failed to query telecom_reference_catalog:', err)
  }

  // Step 3: Alias Table
  try {
    const aliasRes = await supabaseRest(`operator_aliases?alias_name=eq.${encodeURIComponent(normName)}&limit=1`, { cache: 'no-store' })
    if (aliasRes.ok) {
      const alias = await aliasRes.json()
      if (alias && alias.length > 0) {
        const canonicalName = alias[0].canonical_name.toUpperCase()
        const catRes = await supabaseRest(`telecom_reference_catalog?operator_name=eq.${encodeURIComponent(canonicalName)}&limit=1`, { cache: 'no-store' })
        if (catRes.ok) {
          const cat = await catRes.json()
          if (cat && cat.length > 0) {
            return {
              classification: cat[0].classification as any,
              confidence: 0.95,
              reasonCode: 'ALIAS_REFERENCE_CATALOG'
            }
          }
        }
        if (alias[0].system_operator_id) {
          return {
            classification: 'TELECOM',
            confidence: 0.90,
            reasonCode: 'ALIAS_SYSTEM_OPERATOR'
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to query operator_aliases:', err)
  }

  // Step 4: Keyword Classifier
  const keywordResult = classifyOperatorKeywords({
    operatorName,
    planNames: plans.map(p => p.name || ''),
    categories: plans.map(p => p.category || ''),
    subcategories: plans.map(p => p.subcategory || '')
  })

  // Apply capability context weights if provided
  if (capabilities && capabilities.length > 0 && keywordResult.classification !== 'UNKNOWN') {
    const isSupported = capabilities.map(c => c.toUpperCase()).includes(keywordResult.classification.toUpperCase())
    if (!isSupported) {
      keywordResult.confidence = Math.max(0.1, keywordResult.confidence - 0.3)
    }
  }

  return keywordResult
}

// Preserve existing working logic (Legacy wrapper for compatibility)
export function classifyOperatorByPlans(
  providerOperatorName: string,
  plans: NormalizedPlan[]
): {
  isValid: boolean
  reason: 'NO_VALID_PLANS' | 'NON_TELECOM_OPERATOR' | 'GIFT_CARD_PROVIDER' | 'SUBSCRIPTION_SERVICE' | 'GAMING_PROVIDER' | 'LOW_TELECOM_CONFIDENCE' | null
  score: number
} {
  const result = classifyOperatorKeywords({
    operatorName: providerOperatorName,
    planNames: plans.map(p => p.name || ''),
    categories: plans.map(p => p.category || ''),
    subcategories: plans.map(p => p.subcategory || '')
  })

  if (result.classification === 'TELECOM') {
    return { isValid: true, reason: null, score: result.confidence * 10 }
  }

  const reasonMap: Record<string, any> = {
    GIFT_CARD: 'GIFT_CARD_PROVIDER',
    GAMING: 'GAMING_PROVIDER',
    STREAMING: 'SUBSCRIPTION_SERVICE',
    UTILITY: 'NON_TELECOM_OPERATOR',
    UNKNOWN: 'LOW_TELECOM_CONFIDENCE'
  }

  return {
    isValid: false,
    reason: reasonMap[result.classification] || 'NON_TELECOM_OPERATOR',
    score: result.confidence * 10
  }
}
