import crypto from 'crypto'
import type { NormalizedBenefit, NormalizedPlan } from '@/lib/providers/types'

function stableJson(value: unknown): string {
  const seen = new WeakSet<object>()
  const normalize = (v: any): any => {
    if (!v || typeof v !== 'object') return v
    if (seen.has(v)) return '[Circular]'
    seen.add(v)
    if (Array.isArray(v)) return v.map(normalize)
    return Object.keys(v)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        acc[key] = normalize(v[key])
        return acc
      }, {})
  }
  return JSON.stringify(normalize(value))
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'item'
}

export function normalizeText(input: unknown): string {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function benefitValue(benefit: NormalizedBenefit, type: NormalizedBenefit['type']): number {
  if (benefit.type !== type) return 0
  return benefit.totalIncludingTax ?? benefit.totalExcludingTax ?? benefit.amountBase ?? 0
}

function benefitUnit(benefit: NormalizedBenefit, type: NormalizedBenefit['type']): string {
  return benefit.type === type ? (benefit.unit ?? benefit.unitType ?? '').toUpperCase() : ''
}

export function extractPlanSignatureParts(plan: NormalizedPlan) {
  const dataBenefit = plan.benefits.find((b) => b.type === 'DATA')
  const smsBenefit = plan.benefits.find((b) => b.type === 'SMS')
  const voiceBenefit = plan.benefits.find((b) => b.type === 'VOICE')
  const comboBenefit = plan.benefits.find((b) => b.type === 'COMBO')

  const dataAmount = dataBenefit ? benefitValue(dataBenefit, 'DATA') : 0
  const dataUnit = dataBenefit ? benefitUnit(dataBenefit, 'DATA') : ''
  const smsAmount = smsBenefit ? benefitValue(smsBenefit, 'SMS') : 0
  const talktimeAmount = voiceBenefit
    ? benefitValue(voiceBenefit, 'VOICE')
    : comboBenefit
      ? benefitValue(comboBenefit, 'COMBO')
      : 0

  return {
    country: normalizeText(plan.countryIso3),
    operator: normalizeText(plan.operatorRef),
    amount: Number(plan.retailAmount ?? plan.destinationAmount ?? 0),
    currency: normalizeText(plan.retailCurrency ?? plan.destinationUnit ?? ''),
    validityDays: Number(plan.validityDays ?? 0),
    data: dataAmount ? `${dataAmount}${dataUnit}` : '',
    sms: smsAmount ? String(smsAmount) : '',
    talktime: talktimeAmount ? String(talktimeAmount) : '',
    type: normalizeText(plan.planType || plan.subservice || plan.service || 'TOPUP'),
    benefits: plan.benefits
      .map((b) => ({
        type: b.type,
        amount: b.totalIncludingTax ?? b.totalExcludingTax ?? b.amountBase ?? 0,
        unit: normalizeText(b.unit ?? b.unitType ?? ''),
      }))
      .sort((a, b) => `${a.type}:${a.amount}:${a.unit}`.localeCompare(`${b.type}:${b.amount}:${b.unit}`)),
  }
}

export function normalizedPlanSignature(plan: NormalizedPlan): string {
  const parts = extractPlanSignatureParts(plan)
  const country = parts.country || 'UNK'
  const amount = Number.isFinite(parts.amount) ? parts.amount : 0
  const validity = parts.validityDays ? `${parts.validityDays}D` : 'NA'
  const data = parts.data || 'NODATA'
  const sms = parts.sms || 'NOSMS'
  const talktime = parts.talktime || 'NOTALK'
  const type = parts.type || 'TOPUP'
  return [country, amount, validity, data, sms, talktime, type].join('_')
}

export function normalizedPlanHash(plan: NormalizedPlan): string {
  return sha256(stableJson(extractPlanSignatureParts(plan)))
}
