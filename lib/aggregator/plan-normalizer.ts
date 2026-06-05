import type { NormalizedBenefit, NormalizedPlan } from '@/lib/providers/types'
import { extractPlanSignatureParts, normalizedPlanSignature, slugify } from '@/lib/aggregator/signature'
import type { DuplicateCandidate, SystemPlanInput } from '@/lib/aggregator/types'
import { classifyPlan } from '@/lib/aggregator/plan-classifier'


function formatBenefitAmount(benefit: NormalizedBenefit | undefined): string | null {
  if (!benefit) return null
  const amount = benefit.totalIncludingTax ?? benefit.totalExcludingTax ?? benefit.amountBase
  if (!amount) return null
  const unit = (benefit.unit ?? benefit.unitType ?? '').toUpperCase()
  return `${amount}${unit}`.trim()
}

function formatValidity(days?: number): string | null {
  if (!days) return null
  return days === 1 ? '1 Day' : `${days} Days`
}

export function systemPlanName(plan: NormalizedPlan): string {
  const data = formatBenefitAmount(plan.benefits.find((b) => b.type === 'DATA'))
  const sms = formatBenefitAmount(plan.benefits.find((b) => b.type === 'SMS'))
  const voice = formatBenefitAmount(plan.benefits.find((b) => b.type === 'VOICE'))
  const validity = formatValidity(plan.validityDays)
  const amount = plan.retailAmount ? `${plan.retailAmount} ${plan.retailCurrency ?? ''}`.trim() : null

  const parts = [data, voice ? `${voice} Talktime` : null, sms ? `${sms} SMS` : null, validity].filter(Boolean)
  if (parts.length) return parts.join(' - ')
  return plan.name || plan.description || amount || normalizedPlanSignature(plan)
}

export function buildSystemPlanInput(params: {
  plan: NormalizedPlan
  systemOperatorId: string
  internalPlanId?: string | null
}): SystemPlanInput {
  const parts = extractPlanSignatureParts(params.plan)
  const name = systemPlanName(params.plan)
  return {
    systemOperatorId: params.systemOperatorId,
    internalPlanId: params.internalPlanId ?? null,
    systemPlanName: name,
    slug: slugify(name),
    amount: params.plan.retailAmount ?? params.plan.destinationAmount ?? null,
    currency: params.plan.retailCurrency ?? null,
    validity: params.plan.validityDays ? `${params.plan.validityDays}D` : null,
    talktime: parts.talktime || null,
    dataVolume: parts.data || null,
    sms: parts.sms || null,
    planType: params.plan.planType || params.plan.subservice || params.plan.service || null,
    description: params.plan.description ?? params.plan.name ?? null,
    normalizedSignature: normalizedPlanSignature(params.plan),
    status: 'ACTIVE',
  }
}

export function scorePlanCandidate(plan: NormalizedPlan, candidate: {
  normalized_signature?: string | null
  amount?: number | null
  currency?: string | null
  validity?: string | null
  data_volume?: string | null
  sms?: string | null
  talktime?: string | null
  plan_type?: string | null
}): DuplicateCandidate | null {
  const parts = extractPlanSignatureParts(plan)
  const signature = normalizedPlanSignature(plan)
  let score = 0
  const reasons: string[] = []

  if (candidate.normalized_signature === signature) {
    score += 55
    reasons.push('exact normalized signature')
  }
  if (Number(candidate.amount ?? 0) === Number(plan.retailAmount ?? plan.destinationAmount ?? 0)) {
    score += 15
    reasons.push('amount matches')
  }
  if ((candidate.currency ?? '').toUpperCase() === (plan.retailCurrency ?? '').toUpperCase()) {
    score += 10
    reasons.push('currency matches')
  }
  if ((candidate.validity ?? '') === (plan.validityDays ? `${plan.validityDays}D` : '')) {
    score += 10
    reasons.push('validity matches')
  }
  if ((candidate.data_volume ?? '') === parts.data && parts.data) {
    score += 5
    reasons.push('data matches')
  }
  if ((candidate.sms ?? '') === parts.sms && parts.sms) {
    score += 3
    reasons.push('sms matches')
  }
  if ((candidate.talktime ?? '') === parts.talktime && parts.talktime) {
    score += 2
    reasons.push('talktime matches')
  }

  if (score < 70) return null
  return {
    systemPlanId: String((candidate as any).id),
    score,
    reason: reasons.join(', '),
    comparison: {
      signature,
      candidateSignature: candidate.normalized_signature,
      amount: plan.retailAmount ?? plan.destinationAmount ?? null,
      currency: plan.retailCurrency ?? null,
      validity: plan.validityDays ?? null,
      data: parts.data,
      sms: parts.sms,
      talktime: parts.talktime,
    },
  }
}

export function isValidSystemPlan(plan: NormalizedPlan): boolean {
  // Check pricing
  const amount = plan.retailAmount ?? plan.destinationAmount ?? 0
  if (amount <= 0) return false

  // Classify plan
  const classificationResult = classifyPlan(plan)
  const validClassifications = ['AIRTIME', 'DATA', 'VOICE', 'SMS', 'BUNDLE']
  return validClassifications.includes(classificationResult.classification)
}

