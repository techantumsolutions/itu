import crypto from 'crypto'
import type { NormalizedPlan, NormalizedBenefit } from '@/lib/providers/types'

function stableJson(v: unknown): string {
  // Stable JSON stringify for hashing (keys sorted).
  const seen = new WeakSet<object>()
  const normalize = (x: any): any => {
    if (x && typeof x === 'object') {
      if (seen.has(x)) return '[Circular]'
      seen.add(x)
      if (Array.isArray(x)) return x.map(normalize)
      return Object.keys(x)
        .sort()
        .reduce((acc: any, k) => {
          acc[k] = normalize(x[k])
          return acc
        }, {})
    }
    return x
  }
  return JSON.stringify(normalize(v))
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function benefitSignature(b: NormalizedBenefit): string {
  const base = b.totalIncludingTax ?? b.totalExcludingTax ?? b.amountBase ?? 0
  const unit = (b.unit ?? '').toUpperCase()
  return `${b.type}:${base}:${unit}`
}

export type PlanFingerprint = {
  normalizedHash: string
  canonicalSignature: string
  confidence: 'exact' | 'high' | 'partial' | 'manual'
}

export function fingerprintPlan(p: NormalizedPlan): PlanFingerprint {
  const benefitsSig = [...p.benefits].map(benefitSignature).sort().join('|')
  const validity = p.validityDays ?? 0
  const dest = `${p.destinationAmount ?? 0}:${(p.destinationUnit ?? '').toUpperCase()}`
  const type = (p.planType ?? 'UNKNOWN').toUpperCase()
  const tags = (p.tags ?? []).map((t) => t.toUpperCase()).sort().join(',')

  const signatureObj = {
    country: p.countryIso3,
    operatorRef: p.operatorRef,
    service: p.service,
    subservice: p.subservice ?? '',
    type,
    benefitsSig,
    validity,
    dest,
    tags,
  }

  const canonicalSignature = `${p.countryIso3}|${p.operatorRef}|${p.service}/${p.subservice ?? ''}|${type}|${benefitsSig}|${validity}D|${dest}`
  const normalizedHash = sha256(stableJson(signatureObj))

  // Confidence is determined later when comparing across providers; here we mark "exact" for self.
  return { normalizedHash, canonicalSignature, confidence: 'exact' }
}

