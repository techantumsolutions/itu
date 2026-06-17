import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import type { MccMncRecord, RegistryUpsertInput } from './types'
import {
  displayOperatorNameFromNetwork,
  normalizeRegistryAlias,
  normalizeRegistryOperatorName,
  registryOperatorSlug,
  uniqueAliases,
} from './normalize'

countries.registerLocale(enLocale)

const STATUS_BLOCKLIST = new Set(['deleted', 'withdrawn', 'reserved', 'not operational', 'inactive'])
const TYPE_BLOCKLIST = new Set(['test'])

const KNOWN_OPERATOR_ALIASES: Record<string, string[]> = {
  AIRTEL: ['bharti airtel', 'airtel india', 'airtel mobile'],
  JIO: ['reliance jio', 'jio india', 'reliance'],
  VI: ['vodafone idea', 'vodafone in', 'idea cellular', 'vodafone india'],
  VODAFONE: ['vodafone uk', 'vodafone mobile'],
  'VODAFONE IDEA': ['vi', 'idea', 'vodafone in'],
  'T MOBILE': ['t-mobile', 'tmobile'],
  'AT&T': ['att', 'at and t'],
  EE: ['ee mobile', 'everything everywhere'],
  BSNL: ['bharat sanchar nigam'],
  MTNL: ['mahanagar telephone nigam'],
}

function iso2ToIso3(rawCode: string): string | null {
  const code = rawCode.trim().toUpperCase()
  if (!code) return null
  if (code.length === 3) {
    return countries.alpha3ToAlpha2(code) ? code : null
  }
  if (code.length === 2) return countries.alpha2ToAlpha3(code)?.toUpperCase() ?? null
  return null
}

function recordCountryCode(record: MccMncRecord): string {
  return String(record.iso ?? record.countryCode ?? record.country ?? '').trim()
}

function isOperational(status?: string): boolean {
  if (!status) return true
  return !STATUS_BLOCKLIST.has(status.trim().toLowerCase())
}

function networkLabel(record: MccMncRecord): string {
  return String(record.brand || record.network || record.operator || '').trim()
}

export function parseMccMncRecords(records: MccMncRecord[]): RegistryUpsertInput[] {
  const grouped = new Map<string, {
    countryIso3: string
    operatorName: string
    normalizedName: string
    aliases: Set<string>
    mcc?: string
    mnc?: string
    sources: Set<string>
  }>()

  for (const record of records) {
    if (record.type && TYPE_BLOCKLIST.has(record.type.trim().toLowerCase())) continue
    if (!isOperational(record.status)) continue
    const countryIso3 = iso2ToIso3(recordCountryCode(record))
    const network = networkLabel(record)
    if (!countryIso3 || !network) continue

    const normalizedName = normalizeRegistryOperatorName(network)
    if (!normalizedName || normalizedName.length < 2) continue

    const key = `${countryIso3}:${normalizedName}`
    if (!grouped.has(key)) {
      grouped.set(key, {
        countryIso3,
        operatorName: displayOperatorNameFromNetwork(network),
        normalizedName,
        aliases: new Set<string>(),
        mcc: record.mcc ? String(record.mcc) : undefined,
        mnc: record.mnc ? String(record.mnc) : undefined,
        sources: new Set(['mcc_mnc']),
      })
    }

    const bucket = grouped.get(key)!
    bucket.aliases.add(network)
    if (record.brand) bucket.aliases.add(String(record.brand))
    if (record.operator) bucket.aliases.add(String(record.operator))
    if (record.network) bucket.aliases.add(String(record.network))
    if (!bucket.mcc && record.mcc) bucket.mcc = String(record.mcc)
    if (!bucket.mnc && record.mnc) bucket.mnc = String(record.mnc)
  }

  const output: RegistryUpsertInput[] = []
  for (const bucket of grouped.values()) {
    const knownAliases = KNOWN_OPERATOR_ALIASES[bucket.normalizedName] ?? []
    const aliases = uniqueAliases([
      ...bucket.aliases,
      bucket.operatorName,
      ...knownAliases,
    ]).filter((alias) => alias !== normalizeRegistryAlias(bucket.operatorName))

    output.push({
      countryIso3: bucket.countryIso3,
      operatorName: bucket.operatorName,
      normalizedName: bucket.normalizedName,
      slug: registryOperatorSlug(bucket.operatorName, bucket.countryIso3),
      aliases,
      mcc: bucket.mcc ?? null,
      mnc: bucket.mnc ?? null,
      domain: 'MOBILE',
      source: [...bucket.sources].join(','),
    })
  }

  return output.sort((a, b) => a.countryIso3.localeCompare(b.countryIso3) || a.operatorName.localeCompare(b.operatorName))
}

export const MCC_MNC_SOURCES = [
  'https://raw.githubusercontent.com/pbakondy/mcc-mnc-list/master/mcc-mnc-list.json',
  'https://raw.githubusercontent.com/musalbas/mcc-mnc-table/master/mcc-mnc-table.json',
]

function normalizeDownloadedRecords(payload: unknown): MccMncRecord[] {
  if (Array.isArray(payload)) {
    return payload.map((row) => {
      const record = row as Record<string, unknown>
      return {
        mcc: record.mcc ? String(record.mcc) : undefined,
        mnc: record.mnc ? String(record.mnc) : undefined,
        iso: record.iso ? String(record.iso) : undefined,
        country: record.country ? String(record.country) : undefined,
        countryCode: record.countryCode ? String(record.countryCode) : undefined,
        countryName: record.countryName ? String(record.countryName) : undefined,
        network: record.network ? String(record.network) : undefined,
        brand: record.brand ? String(record.brand) : undefined,
        operator: record.operator ? String(record.operator) : undefined,
        status: record.status ? String(record.status) : undefined,
        type: record.type ? String(record.type) : undefined,
      }
    })
  }

  if (payload && typeof payload === 'object') {
    const values = Object.values(payload as Record<string, unknown>)
    if (values.length && values.every((value) => typeof value === 'object' && value !== null)) {
      return normalizeDownloadedRecords(values)
    }
  }

  throw new Error('Unsupported MCC/MNC payload shape')
}

export async function downloadMccMncDataset(): Promise<MccMncRecord[]> {
  let lastError: unknown = null
  for (const url of MCC_MNC_SOURCES) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const payload = await res.json()
      const records = normalizeDownloadedRecords(payload)
      if (!records.length) throw new Error('Downloaded MCC/MNC dataset was empty')
      return records
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to download MCC/MNC dataset')
}

export function curatedMobileOperators(): RegistryUpsertInput[] {
  const seed: Array<{ country: string; operators: Array<{ name: string; aliases?: string[]; mcc?: string; mnc?: string }> }> = [
    {
      country: 'IND',
      operators: [
        { name: 'Airtel', aliases: ['bharti airtel', 'airtel india'], mcc: '404', mnc: '10' },
        { name: 'Jio', aliases: ['reliance jio'], mcc: '405', mnc: '857' },
        { name: 'Vi', aliases: ['vodafone idea', 'idea cellular', 'vodafone in'], mcc: '404', mnc: '20' },
        { name: 'BSNL', aliases: ['bharat sanchar nigam'], mcc: '404', mnc: '38' },
        { name: 'MTNL', mcc: '404', mnc: '68' },
      ],
    },
    {
      country: 'USA',
      operators: [
        { name: 'AT&T', aliases: ['att', 'at and t'], mcc: '310', mnc: '410' },
        { name: 'Verizon', mcc: '311', mnc: '480' },
        { name: 'T-Mobile', aliases: ['tmobile'], mcc: '310', mnc: '260' },
      ],
    },
    {
      country: 'GBR',
      operators: [
        { name: 'EE', aliases: ['everything everywhere'], mcc: '234', mnc: '30' },
        { name: 'Vodafone', aliases: ['vodafone uk'], mcc: '234', mnc: '15' },
        { name: 'O2', mcc: '234', mnc: '10' },
        { name: 'Three', aliases: ['3'], mcc: '234', mnc: '20' },
      ],
    },
    {
      country: 'ARE',
      operators: [
        { name: 'Etisalat', aliases: ['e&'], mcc: '424', mnc: '02' },
        { name: 'du', mcc: '424', mnc: '03' },
      ],
    },
    {
      country: 'SAU',
      operators: [
        { name: 'STC', aliases: ['saudi telecom'], mcc: '420', mnc: '01' },
        { name: 'Mobily', mcc: '420', mnc: '03' },
        { name: 'Zain', mcc: '420', mnc: '04' },
      ],
    },
  ]

  const output: RegistryUpsertInput[] = []
  for (const group of seed) {
    for (const operator of group.operators) {
      const normalizedName = normalizeRegistryOperatorName(operator.name)
      output.push({
        countryIso3: group.country,
        operatorName: operator.name,
        normalizedName,
        slug: registryOperatorSlug(operator.name, group.country),
        aliases: uniqueAliases([operator.name, ...(operator.aliases ?? [])]).filter(
          (alias) => alias !== normalizeRegistryAlias(operator.name),
        ),
        mcc: operator.mcc ?? null,
        mnc: operator.mnc ?? null,
        domain: 'MOBILE',
        source: 'curated',
      })
    }
  }
  return output
}
