import type { NormalizedPlan } from '@/lib/providers/types'
import { fingerprintPlan } from '@/lib/uti/normalize'

export type MatchCandidate = {
  normalizedHash: string
  canonicalSignature: string
  score: number
  level: 'exact' | 'high' | 'partial' | 'manual'
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function same(a?: string, b?: string) {
  return (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()
}

function scorePlanPair(a: NormalizedPlan, b: NormalizedPlan): number {
  let score = 0
  if (same(a.countryIso3, b.countryIso3)) score += 30
  if (same(a.operatorRef, b.operatorRef)) score += 30
  if (same(a.service, b.service)) score += 10
  if (same(a.subservice, b.subservice)) score += 8

  const aValidity = a.validityDays ?? 0
  const bValidity = b.validityDays ?? 0
  const validityDelta = Math.abs(aValidity - bValidity)
  score += validityDelta === 0 ? 10 : validityDelta <= 2 ? 6 : validityDelta <= 7 ? 2 : 0

  const aDest = a.destinationAmount ?? 0
  const bDest = b.destinationAmount ?? 0
  const amtDelta = Math.abs(aDest - bDest)
  score += amtDelta === 0 ? 10 : amtDelta <= 1 ? 6 : amtDelta <= 5 ? 2 : 0

  const aBenefits = a.benefits.map((x) => `${x.type}:${x.totalIncludingTax ?? x.totalExcludingTax ?? x.amountBase ?? 0}:${(x.unit ?? '').toUpperCase()}`).sort()
  const bBenefits = b.benefits.map((x) => `${x.type}:${x.totalIncludingTax ?? x.totalExcludingTax ?? x.amountBase ?? 0}:${(x.unit ?? '').toUpperCase()}`).sort()
  const overlap = aBenefits.filter((x) => bBenefits.includes(x)).length
  const denom = Math.max(1, Math.max(aBenefits.length, bBenefits.length))
  score += clamp(Math.round((overlap / denom) * 12), 0, 12)

  return clamp(score, 0, 100)
}

export function matchPlanToCandidates(plan: NormalizedPlan, candidates: NormalizedPlan[]): MatchCandidate[] {
  const fp = fingerprintPlan(plan)
  return candidates
    .map((c) => {
      const score = scorePlanPair(plan, c)
      const level: MatchCandidate['level'] =
        score >= 95 ? 'exact' : score >= 85 ? 'high' : score >= 70 ? 'partial' : 'manual'
      const cfp = fingerprintPlan(c)
      return {
        normalizedHash: cfp.normalizedHash,
        canonicalSignature: cfp.canonicalSignature,
        score,
        level,
      }
    })
    .sort((a, b) => b.score - a.score)
}

