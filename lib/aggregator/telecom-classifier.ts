import type { NormalizedPlan } from '@/lib/providers/types'

export type FilteredOperatorAudit = {
  providerId: string
  rawOperatorId: string
  rawOperatorName: string
  filterReason: 'NO_VALID_PLANS' | 'NON_TELECOM_OPERATOR' | 'GIFT_CARD_PROVIDER' | 'SUBSCRIPTION_SERVICE' | 'GAMING_PROVIDER' | 'LOW_TELECOM_CONFIDENCE'
  classificationScore: number
}

const POSITIVE_WORDS = [
  'data', 'calling', 'voice', 'sms', 'airtime', 'topup', 'recharge', 'telecom', 'bundle', 'combo', 'talktime', 'minutes', 'roaming'
]

const NEGATIVE_GIFT_CARD_WORDS = [
  'gift card', 'giftcard', 'gift voucher', 'voucher', 'coupon', 'retail', 'membership', 'loyalty', 'reward', 'amazon', 'myntra', 'nykaa',
  'bigbasket', 'dominos', 'kfc', 'pepperfry', 'uber', 'ola', 'marriott', 'easemytrip', 'freshmenu', 'cultfit', 'spar', 'wajeez', 'store credit'
]

const NEGATIVE_GAMING_WORDS = [
  'gaming', 'game', 'token', 'credits', 'currency', 'archeage', 'badlanders', 'doomsday', 'pubg', 'free fire', 'freefire', 'minecraft', 'roblox'
]

const NEGATIVE_SUBSCRIPTION_WORDS = [
  'subscription', 'entertainment', 'streaming', 'crunchyroll', 'discord', 'nitro', 'twitch', 'netflix', 'spotify', 'ott'
]

const NEGATIVE_SERVICES_WORDS = [
  'food delivery', 'travel', 'hotel', 'delivery'
]

export function scorePlanForTelecom(plan: NormalizedPlan): { score: number; classification: 'telecom' | 'gift_card' | 'gaming' | 'subscription' | 'other' } {
  let includeScore = 0
  let excludeScore = 0

  const name = (plan.name ?? '').toLowerCase()
  const desc = (plan.description ?? '').toLowerCase()
  const service = (plan.service ?? '').toLowerCase()
  const subservice = (plan.subservice ?? '').toLowerCase()
  const planType = (plan.planType ?? '').toLowerCase()
  const category = (plan.category ?? '').toLowerCase()
  
  const benefitsText = plan.benefits
    ? typeof plan.benefits === 'string'
      ? plan.benefits.toLowerCase()
      : JSON.stringify(plan.benefits).toLowerCase()
    : ''
  
  const tagsText = (plan.tags ?? []).join(' ').toLowerCase()

  const allTexts = [name, desc, service, subservice, planType, category, benefitsText, tagsText]

  // Check positive signals
  for (const word of POSITIVE_WORDS) {
    for (const text of allTexts) {
      if (text.includes(word)) {
        includeScore += 10
        break
      }
    }
  }

  // Check negative signals and categorize
  let isGiftCard = false
  let isGaming = false
  let isSubscription = false

  for (const word of NEGATIVE_GIFT_CARD_WORDS) {
    for (const text of allTexts) {
      if (text.includes(word)) {
        excludeScore += 10
        isGiftCard = true
        break
      }
    }
  }

  for (const word of NEGATIVE_GAMING_WORDS) {
    for (const text of allTexts) {
      if (text.includes(word)) {
        excludeScore += 10
        isGaming = true
        break
      }
    }
  }

  for (const word of NEGATIVE_SUBSCRIPTION_WORDS) {
    for (const text of allTexts) {
      if (text.includes(word)) {
        excludeScore += 10
        isSubscription = true
        break
      }
    }
  }

  for (const word of NEGATIVE_SERVICES_WORDS) {
    for (const text of allTexts) {
      if (text.includes(word)) {
        excludeScore += 10
        break
      }
    }
  }

  const finalScore = includeScore - excludeScore

  let classification: 'telecom' | 'gift_card' | 'gaming' | 'subscription' | 'other' = 'other'
  if (isGiftCard) classification = 'gift_card'
  else if (isGaming) classification = 'gaming'
  else if (isSubscription) classification = 'subscription'
  else if (finalScore > 0) classification = 'telecom'

  return { score: finalScore, classification }
}

export function classifyOperatorByPlans(
  providerOperatorName: string,
  plans: NormalizedPlan[]
): {
  isValid: boolean
  reason: FilteredOperatorAudit['filterReason'] | null
  score: number
} {
  if (!plans || plans.length === 0) {
    return {
      isValid: false,
      reason: 'NO_VALID_PLANS',
      score: 0,
    }
  }

  let totalScore = 0
  let telecomCount = 0
  let giftCardCount = 0
  let gamingCount = 0
  let subscriptionCount = 0

  for (const plan of plans) {
    const { score, classification } = scorePlanForTelecom(plan)
    totalScore += score
    if (classification === 'telecom') telecomCount++
    else if (classification === 'gift_card') giftCardCount++
    else if (classification === 'gaming') gamingCount++
    else if (classification === 'subscription') subscriptionCount++
  }

  const avgScore = totalScore / plans.length
  const totalPlans = plans.length
  
  if (telecomCount === 0) {
    if (giftCardCount > 0) {
      return { isValid: false, reason: 'GIFT_CARD_PROVIDER', score: avgScore }
    }
    if (gamingCount > 0) {
      return { isValid: false, reason: 'GAMING_PROVIDER', score: avgScore }
    }
    if (subscriptionCount > 0) {
      return { isValid: false, reason: 'SUBSCRIPTION_SERVICE', score: avgScore }
    }
    return { isValid: false, reason: 'NON_TELECOM_OPERATOR', score: avgScore }
  }

  const nonTelecomCount = giftCardCount + gamingCount + subscriptionCount
  if (nonTelecomCount > telecomCount) {
    if (giftCardCount >= gamingCount && giftCardCount >= subscriptionCount) {
      return { isValid: false, reason: 'GIFT_CARD_PROVIDER', score: avgScore }
    }
    if (gamingCount >= giftCardCount && gamingCount >= subscriptionCount) {
      return { isValid: false, reason: 'GAMING_PROVIDER', score: avgScore }
    }
    return { isValid: false, reason: 'SUBSCRIPTION_SERVICE', score: avgScore }
  }

  if (avgScore < 5 && telecomCount / totalPlans < 0.3) {
    return { isValid: false, reason: 'LOW_TELECOM_CONFIDENCE', score: avgScore }
  }

  return {
    isValid: true,
    reason: null,
    score: avgScore,
  }
}
