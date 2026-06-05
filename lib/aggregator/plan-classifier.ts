import { NormalizedPlan } from '@/lib/providers/types'

export type PlanClassificationResult = {
  classification: 'AIRTIME' | 'DATA' | 'VOICE' | 'SMS' | 'BUNDLE' | 'PIN' | 'GIFT_CARD' | 'UTILITY' | 'STREAMING' | 'UNKNOWN'
  confidence: number
  reasonCode: string
}

export function classifyPlan(plan: NormalizedPlan): PlanClassificationResult {
  const name = (plan.name || '').toLowerCase()
  const desc = (plan.description || '').toLowerCase()
  const cat = (plan.category || '').toLowerCase()
  const subcat = (plan.subcategory || '').toLowerCase()
  const planType = (plan.planType || '').toLowerCase()

  const allText = `${name} ${desc} ${cat} ${subcat} ${planType}`

  // 1. Check for gift cards
  const giftCardKeywords = ['gift card', 'giftcard', 'gift voucher', 'voucher', 'coupon', 'play store', 'app store', 'itunes', 'google play', 'amazon', 'netflix', 'spotify', 'xbox', 'playstation', 'steam', 'roblox']
  if (giftCardKeywords.some(kw => allText.includes(kw))) {
    return { classification: 'GIFT_CARD', confidence: 0.95, reasonCode: 'GIFT_CARD_KEYWORDS' }
  }

  // 2. Check for streaming
  const streamingKeywords = ['netflix', 'spotify', 'ott', 'streaming', 'crunchyroll', 'disney', 'hulu', 'prime video']
  if (streamingKeywords.some(kw => allText.includes(kw))) {
    return { classification: 'STREAMING', confidence: 0.95, reasonCode: 'STREAMING_KEYWORDS' }
  }

  // 3. Check for utilities
  const utilityKeywords = ['electricity', 'water', 'gas', 'utility', 'utilities', 'broadband', 'landline']
  if (utilityKeywords.some(kw => allText.includes(kw))) {
    return { classification: 'UTILITY', confidence: 0.95, reasonCode: 'UTILITY_KEYWORDS' }
  }

  // 4. Check for PIN categories/keywords
  const pinKeywords = ['pin', 'voucher pin', 'e-pin', 'epin']
  if (pinKeywords.some(kw => cat.includes(kw) || planType.includes(kw))) {
    return { classification: 'PIN', confidence: 0.90, reasonCode: 'PIN_CATEGORY' }
  }

  // 5. Check benefits first (most reliable indicator)
  const benefitTypes = plan.benefits.map(b => b.type)
  const hasData = benefitTypes.includes('DATA')
  const hasVoice = benefitTypes.includes('VOICE')
  const hasSms = benefitTypes.includes('SMS')
  const hasAirtime = benefitTypes.includes('AIRTIME')
  const hasCombo = benefitTypes.includes('COMBO')

  if (hasCombo || (hasData && (hasVoice || hasSms))) {
    return { classification: 'BUNDLE', confidence: 0.95, reasonCode: 'BENEFITS_COMBO' }
  }
  if (hasData) {
    return { classification: 'DATA', confidence: 0.95, reasonCode: 'BENEFITS_DATA' }
  }
  if (hasVoice) {
    return { classification: 'VOICE', confidence: 0.95, reasonCode: 'BENEFITS_VOICE' }
  }
  if (hasSms) {
    return { classification: 'SMS', confidence: 0.95, reasonCode: 'BENEFITS_SMS' }
  }
  if (hasAirtime) {
    return { classification: 'AIRTIME', confidence: 0.95, reasonCode: 'BENEFITS_AIRTIME' }
  }

  // 6. Check keywords in text
  const dataKeywords = ['data', 'gb', 'mb', 'internet', 'lte', '4g', '5g']
  const voiceKeywords = ['voice', 'minutes', 'mins', 'talktime', 'calling', 'calls']
  const smsKeywords = ['sms', 'text', 'texts']
  const airtimeKeywords = ['airtime', 'topup', 'recharge', 'top up']
  const bundleKeywords = ['bundle', 'combo', 'pack', 'unlimited', 'package']

  let dataScore = 0
  let voiceScore = 0
  let smsScore = 0
  let airtimeScore = 0
  let bundleScore = 0

  for (const kw of dataKeywords) { if (allText.includes(kw)) dataScore += 5 }
  for (const kw of voiceKeywords) { if (allText.includes(kw)) voiceScore += 5 }
  for (const kw of smsKeywords) { if (allText.includes(kw)) smsScore += 5 }
  for (const kw of airtimeKeywords) { if (allText.includes(kw)) airtimeScore += 5 }
  for (const kw of bundleKeywords) { if (allText.includes(kw)) bundleScore += 5 }

  const scores = [
    { type: 'DATA', score: dataScore },
    { type: 'VOICE', score: voiceScore },
    { type: 'SMS', score: smsScore },
    { type: 'AIRTIME', score: airtimeScore },
    { type: 'BUNDLE', score: bundleScore }
  ]

  const sorted = scores.sort((a, b) => b.score - a.score)
  const top = sorted[0]
  if (top.score > 0) {
    const totalScore = scores.reduce((sum, item) => sum + item.score, 0)
    const confidence = Math.min(0.90, Math.max(0.60, top.score / totalScore))
    return {
      classification: top.type as any,
      confidence,
      reasonCode: 'KEYWORD_SCORING'
    }
  }

  return {
    classification: 'UNKNOWN',
    confidence: 0.30,
    reasonCode: 'REJECT_UNKNOWN_CATEGORY'
  }
}
