import { supabaseRest } from '@/lib/db/supabase-rest'

export type CountryRow = {
  id: string
  name: string
  iso2: string
  iso3: string
  dial_prefix: string | null
  min_length: number | null
  max_length: number | null
}

export type OperatorRow = {
  id?: string
  country_id: string
  code: string
  name: string
  short_name: string | null
  logo_url: string | null
  validation_regex: string | null
  region_code: string | null
  is_default: boolean | null
}

export type PlanRow = {
  sku_code: string
  country_id: string
  operator_code: string
  price_inr: number | string | null
  price_eur: number | string | null
  validity: string | null
  plan_type: string | null
  tag: string | null
  benefits: string | null
  data_label: string | null
  calls_label: string | null
  sms_label: string | null
  plan_name: string | null
  benefits_json?: unknown
  min_send_amount?: number | string | null
  max_send_amount?: number | string | null
  send_currency?: string | null
  min_receive_amount?: number | string | null
  max_receive_amount?: number | string | null
  receive_currency?: string | null
  commission_rate?: number | string | null
  processing_mode?: string | null
}

export async function dbFetchCountries(): Promise<CountryRow[]> {
  const res = await supabaseRest('countries?select=id,name,iso2,iso3,dial_prefix,min_length,max_length&order=name.asc')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function dbFetchOperators(countryIso: string): Promise<OperatorRow[]> {
  const iso = encodeURIComponent(countryIso.toUpperCase())
  const res = await supabaseRest(`operators?country_id=eq.${iso}&select=id,country_id,code,name,short_name,logo_url,validation_regex,region_code,is_default&order=name.asc`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function dbFetchOperatorsForCountries(isos: string[]): Promise<Pick<OperatorRow, 'country_id'>[]> {
  if (!isos.length) return []
  const list = isos.map((c) => encodeURIComponent(c.toUpperCase())).join(',')
  const res = await supabaseRest(`operators?select=country_id&country_id=in.(${list})`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function dbFetchPlans(countryIso: string, operatorCode?: string | null): Promise<PlanRow[]> {
  const c = encodeURIComponent(countryIso.toUpperCase())
  const op = operatorCode?.trim()
  const filter =
    op && op.length > 0 ? `&operator_code=eq.${encodeURIComponent(op)}` : ''
  const res = await supabaseRest(`plans?country_id=eq.${c}${filter}&select=*&order=price_inr.asc`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function pickOperatorForPhone(operators: OperatorRow[], localDigits: string): OperatorRow | null {
  const digits = localDigits.replace(/\D/g, '')
  if (!digits) return null

  // If there's only one operator for the country, we can safely assume it.
  if (operators.length === 1) return operators[0]

  for (const op of operators) {
    const rx = op.validation_regex?.trim()
    if (!rx) continue
    try {
      const re = new RegExp(rx)
      if (re.test(digits)) return op
    } catch {
      continue
    }
  }

  // If no validation regex matches, do not guess. Returning null prevents
  // incorrectly showing a single operator (e.g. "Jio") for every number.
  return null
}
