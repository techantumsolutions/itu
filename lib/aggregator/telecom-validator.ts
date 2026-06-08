import type { NormalizedPlan } from '@/lib/providers/types'
import { isValidSystemPlan } from './plan-normalizer'

export function hasTelecomPositiveSignal(plan: NormalizedPlan): boolean {
  // Check benefit types first (highly reliable)
  const benefitTypes = (plan.benefits || []).map(b => String(b.type).toUpperCase())
  if (benefitTypes.some(t => ['DATA', 'VOICE', 'SMS', 'AIRTIME', 'COMBO'].includes(t))) {
    return true
  }

  const name = (plan.name || '').toLowerCase()
  const desc = (plan.description || '').toLowerCase()
  const cat = (plan.category || '').toLowerCase()
  const subcat = (plan.subcategory || '').toLowerCase()
  const type = (plan.planType || '').toLowerCase()
  const rawService = String((plan.raw as any)?.service || '').toLowerCase()

  const allText = `${name} ${desc} ${cat} ${subcat} ${type} ${rawService}`

  // Positive signals
  const positiveRegex = /\b(data|gb|mb|sms|voice|calling|talktime|recharge|airtime|topup|bundle|roaming|prepaid)\b|(\d+(gb|mb)\b)/i
  return positiveRegex.test(allText)
}

export function hasTelecomNegativeSignal(plan: NormalizedPlan): { matches: boolean; category?: string } {
  const name = (plan.name || '').toLowerCase()
  const desc = (plan.description || '').toLowerCase()
  const cat = (plan.category || '').toLowerCase()
  const subcat = (plan.subcategory || '').toLowerCase()
  const type = (plan.planType || '').toLowerCase()
  const rawService = String((plan.raw as any)?.service || '').toLowerCase()

  const allText = `${name} ${desc} ${cat} ${subcat} ${type} ${rawService}`

  // Gaming
  const gamingRegex = /\b(game|gaming|game credits|xbox|playstation|nintendo|steam|roblox|pubg|free fire|minecraft|razer|badlanders|archeage|doomsday)\b/i
  if (gamingRegex.test(allText)) {
    return { matches: true, category: 'GAMING_PROVIDER' }
  }

  // Streaming & subscription
  const subRegex = /\b(subscription|membership|ott|streaming|netflix|spotify|crunchyroll|disney|hulu|prime video|twitch|discord|youtube premium)\b/i
  if (subRegex.test(allText)) {
    return { matches: true, category: 'SUBSCRIPTION_PROVIDER' }
  }

  // Food delivery & restaurant
  const foodRegex = /\b(food|restaurant|dominos|kfc|freshmenu|starbucks|mcdonalds|swiggy|zomato)\b/i
  if (foodRegex.test(allText)) {
    return { matches: true, category: 'RETAIL_PROVIDER' }
  }

  // Travel & hotel
  const travelRegex = /\b(travel|hotel|marriott|easemytrip|uber|ola|cab|taxi|flight|booking)\b/i
  if (travelRegex.test(allText)) {
    return { matches: true, category: 'TRAVEL_PROVIDER' }
  }

  // Retail & shopping
  const retailRegex = /\b(retail|shopping|store|gift card|giftcard|voucher|coupon|amazon|ebay|walmart|target|nike|myntra|nykaa|pepperfry|spar|bigbasket|cultfit|rewards|loyalty|points)\b/i
  if (retailRegex.test(allText)) {
    return { matches: true, category: 'RETAIL_PROVIDER' }
  }

  return { matches: false }
}

export function validateOperatorTelecomService(plans: NormalizedPlan[]): {
  passed: boolean
  reason: string
  telecomPlanCount: number
  totalPlanCount: number
  telecomRatio: number
} {
  const totalPlanCount = plans.length
  if (totalPlanCount === 0) {
    return { passed: false, reason: 'NO_VALID_PLANS', telecomPlanCount: 0, totalPlanCount: 0, telecomRatio: 0 }
  }

  let telecomPlanCount = 0
  const negativeCategoryCounts = new Map<string, number>()

  for (const p of plans) {
    const isTelecom = isValidSystemPlan(p) && hasTelecomPositiveSignal(p) && !hasTelecomNegativeSignal(p).matches
    if (isTelecom) {
      telecomPlanCount++
    } else {
      const negResult = hasTelecomNegativeSignal(p)
      if (negResult.matches && negResult.category) {
        negativeCategoryCounts.set(negResult.category, (negativeCategoryCounts.get(negResult.category) || 0) + 1)
      }
    }
  }

  const telecomRatio = telecomPlanCount / totalPlanCount

  // Identify dominant non-telecom category
  let dominantCategory = 'NON_TELECOM_SERVICE'
  let maxNegCount = 0
  let totalNegCount = 0
  for (const [cat, count] of negativeCategoryCounts.entries()) {
    totalNegCount += count
    if (count > maxNegCount) {
      maxNegCount = count
      dominantCategory = cat
    }
  }

  if (telecomPlanCount === 0) {
    return { passed: false, reason: 'NO_TELECOM_PLANS', telecomPlanCount, totalPlanCount, telecomRatio }
  }

  if (telecomRatio < 0.1) {
    return { passed: false, reason: 'LOW_TELECOM_RATIO', telecomPlanCount, totalPlanCount, telecomRatio }
  }

  if (totalNegCount > telecomPlanCount) {
    return { passed: false, reason: dominantCategory, telecomPlanCount, totalPlanCount, telecomRatio }
  }

  return { passed: true, reason: '', telecomPlanCount, totalPlanCount, telecomRatio }
}

export function isTelecomSystemPlan(sp: any): boolean {
  const name = (sp.system_plan_name || '').toLowerCase()
  const desc = (sp.description || '').toLowerCase()
  const type = (sp.plan_type || '').toLowerCase()
  const allText = `${name} ${desc} ${type}`

  // Negative Keywords
  const negativeRegex = /\b(gift card|giftcard|voucher|coupon|subscription|membership|game credits|gaming|streaming|retail|shopping|food|travel|hotel|rewards|loyalty|points)\b/i
  if (negativeRegex.test(allText)) return false

  // Positive Keywords (Rule 3)
  const positiveRegex = /\b(data|gb|mb|sms|voice|calling|talktime|recharge|airtime|topup|bundle|roaming|prepaid)\b|(\d+(gb|mb)\b)/i
  if (positiveRegex.test(allText)) return true

  // Also if data_volume or sms or talktime is present, it's telecom!
  if (sp.data_volume || sp.sms || sp.talktime) return true

  return false
}

export function extractRawPlanFields(raw: any) {
  if (!raw || typeof raw !== 'object') {
    return {
      benefits: [],
      serviceName: '',
      subserviceName: '',
      tags: [],
      type: '',
      description: '',
      productName: '',
    }
  }

  // benefits / Benefits
  const benefits = raw.benefits || raw.Benefits || []

  // service.name / service.subservice.name
  const serviceName = raw.service?.name || ''
  const subserviceName = raw.service?.subservice?.name || ''

  // tags
  const tags = raw.tags || []

  // type
  const type = raw.type || ''

  // description
  const description = raw.description || ''

  // product name / productName / product_name
  const productName = raw['product name'] || raw.productName || raw.product_name || ''

  return {
    benefits: Array.isArray(benefits) ? benefits : [],
    serviceName: String(serviceName),
    subserviceName: String(subserviceName),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    type: String(type),
    description: String(description),
    productName: String(productName),
  }
}

export function isTelecomPlanRaw(raw: any): boolean {
  const fields = extractRawPlanFields(raw)

  // 1. Check benefit type
  const hasTelecomBenefit = fields.benefits.some(b => {
    if (typeof b === 'string') {
      const strUpper = b.trim().toUpperCase()
      return ['DATA', 'SMS', 'TALKTIME', 'VOICE', 'MINUTES', 'AIRTIME', 'MOBILE'].includes(strUpper)
    }
    const typeStr = String(b.type || b.benefitType || b.benefit_type || '').toUpperCase()
    const unitTypeStr = String(b.unit_type || b.unitType || b.unit || '').toUpperCase()
    return ['DATA', 'SMS', 'TALKTIME', 'VOICE', 'MINUTES', 'AIRTIME'].includes(typeStr) ||
           ['DATA', 'SMS', 'TALKTIME', 'VOICE', 'MINUTES', 'AIRTIME'].includes(unitTypeStr)
  })
  if (hasTelecomBenefit) return true

  // 2. Check tags
  const hasTelecomTag = fields.tags.some(t => {
    const tagStr = String(t).toUpperCase()
    return ['AIRTIME', 'BUNDLE'].includes(tagStr)
  })
  if (hasTelecomTag) return true

  // 3. Check service name/subservice name
  const serviceText = `${fields.serviceName} ${fields.subserviceName}`.toLowerCase()
  if (/\b(mobile|airtime|bundle)\b/i.test(serviceText)) return true

  // 4. Check description
  const descText = fields.description.toLowerCase()
  if (/\b(data|gb|mb|sms|minutes|talktime|voice|recharge)\b/i.test(descText) || /\b\d+(gb|mb)\b/i.test(descText)) {
    return true
  }

  return false
}

export function isNonTelecomPlanRaw(raw: any): { matches: boolean; category?: string } {
  const fields = extractRawPlanFields(raw)
  const allText = `${fields.description} ${fields.type} ${fields.productName} ${fields.serviceName} ${fields.subserviceName} ${fields.tags.join(' ')}`.toLowerCase()

  const nonTelecomTerms = [
    { regex: /\b(digitalproduct|digital\s*product)\b/i, category: 'DIGITAL_PRODUCT_ONLY' },
    { regex: /\b(giftcard|gift\s*card)\b/i, category: 'RETAIL_PROVIDER' },
    { regex: /\b(voucher)\b/i, category: 'RETAIL_PROVIDER' },
    { regex: /\b(coupon)\b/i, category: 'RETAIL_PROVIDER' },
    { regex: /\b(membership)\b/i, category: 'SUBSCRIPTION_PROVIDER' },
    { regex: /\b(subscription)\b/i, category: 'SUBSCRIPTION_PROVIDER' },
    { regex: /\b(gaming|game)\b/i, category: 'GAMING_PROVIDER' },
    { regex: /\b(streaming)\b/i, category: 'SUBSCRIPTION_PROVIDER' },
    { regex: /\b(travel)\b/i, category: 'TRAVEL_PROVIDER' },
    { regex: /\b(hotel)\b/i, category: 'TRAVEL_PROVIDER' },
    { regex: /\b(retail)\b/i, category: 'RETAIL_PROVIDER' },
    { regex: /\b(shopping)\b/i, category: 'RETAIL_PROVIDER' },
    { regex: /\b(food)\b/i, category: 'RETAIL_PROVIDER' },
  ]

  for (const term of nonTelecomTerms) {
    if (term.regex.test(allText)) {
      return { matches: true, category: term.category }
    }
  }

  return { matches: false }
}

export function validateRawOperatorPlans(rawPlans: any[]): {
  passed: boolean
  reason: string
  telecomPlanCount: number
  totalPlanCount: number
  telecomRatio: number
} {
  const totalPlanCount = rawPlans.length
  if (totalPlanCount === 0) {
    return { passed: false, reason: 'NO_VALID_PLANS', telecomPlanCount: 0, totalPlanCount: 0, telecomRatio: 0 }
  }

  let telecomPlanCount = 0
  let nonTelecomPlanCount = 0
  let digitalProductCount = 0
  let hasTelecomBenefits = false

  for (const p of rawPlans) {
    const raw = p.raw_json || p.row_json || p.raw || p
    const isTelecom = isTelecomPlanRaw(raw)
    const nonTelecomCheck = isNonTelecomPlanRaw(raw)

    if (isTelecom) {
      telecomPlanCount++
    }

    if (nonTelecomCheck.matches) {
      nonTelecomPlanCount++
      if (nonTelecomCheck.category === 'DIGITAL_PRODUCT_ONLY') {
        digitalProductCount++
      } else {
        digitalProductCount++
      }
    }

    // Check for benefit types (Rule 7)
    const fields = extractRawPlanFields(raw)
    const planHasBenefits = fields.benefits.some(b => {
      if (typeof b === 'string') {
        const strUpper = b.trim().toUpperCase()
        return ['DATA', 'SMS', 'TALKTIME', 'VOICE', 'MINUTES', 'AIRTIME', 'MOBILE'].includes(strUpper)
      }
      
      const typeStr = String(b.type || b.benefitType || b.benefit_type || '').toUpperCase()
      const unitTypeStr = String(b.unit_type || b.unitType || b.unit || '').toUpperCase()
      
      const isTelecomType = ['DATA', 'SMS', 'TALKTIME', 'VOICE', 'MINUTES', 'AIRTIME'].includes(typeStr) ||
                            ['DATA', 'SMS', 'TALKTIME', 'VOICE', 'MINUTES', 'AIRTIME'].includes(unitTypeStr)
      if (isTelecomType) return true

      // If the plan itself is classified as telecom airtime and has credits/currency/cash benefits, count it!
      const isAirtime = isTelecomPlanRaw(raw)
      const isCredits = ['CREDITS', 'CURRENCY', 'CASH', 'MONEY'].includes(typeStr) || ['CREDITS', 'CURRENCY', 'CASH', 'MONEY'].includes(unitTypeStr)
      if (isAirtime && isCredits) return true

      return false
    })
    if (planHasBenefits) {
      hasTelecomBenefits = true
    }
  }

  const telecomRatio = totalPlanCount > 0 ? telecomPlanCount / totalPlanCount : 0

  // Rule 7 Checks:
  if (digitalProductCount === totalPlanCount || nonTelecomPlanCount === totalPlanCount) {
    return { passed: false, reason: 'DIGITAL_PRODUCT_ONLY', telecomPlanCount, totalPlanCount, telecomRatio }
  }

  if (!hasTelecomBenefits) {
    return { passed: false, reason: 'NO_TELECOM_BENEFITS', telecomPlanCount, totalPlanCount, telecomRatio }
  }

  if (telecomPlanCount === 0) {
    return { passed: false, reason: 'NON_MOBILE_RECHARGE', telecomPlanCount, totalPlanCount, telecomRatio }
  }

  // Ratio Check (Rule 4)
  if (telecomRatio < 0.1) {
    return { passed: false, reason: 'NON_MOBILE_RECHARGE', telecomPlanCount, totalPlanCount, telecomRatio }
  }

  // Category Dominance Check
  if (nonTelecomPlanCount > telecomPlanCount) {
    return { passed: false, reason: 'NON_MOBILE_RECHARGE', telecomPlanCount, totalPlanCount, telecomRatio }
  }

  return { passed: true, reason: '', telecomPlanCount, totalPlanCount, telecomRatio }
}
