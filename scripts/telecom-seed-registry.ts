/**
 * Seed global mobile operators into domain_operator_registry from MCC/MNC datasets.
 *   npm run telecom:seed-registry
 *   npm run telecom:seed-registry -- --curated-only
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { runtimeEnv } from '../lib/env/runtime'
import {
  countDomainOperatorRegistry,
  countLegacyOperatorDomainRegistry,
  curatedMobileOperators,
  downloadMccMncDataset,
  parseMccMncRecords,
  syncLegacyOperatorDomainRegistry,
  upsertDomainOperatorRegistryRows,
} from '../lib/aggregator/telecom-registry'

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

async function main() {
  loadDotEnv()
  const curatedOnly = process.argv.includes('--curated-only')

  if (!runtimeEnv('SUPABASE_URL') || !runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const beforeDomainCount = await countDomainOperatorRegistry()
  const beforeLegacyCount = await countLegacyOperatorDomainRegistry()
  console.log(`Current domain_operator_registry rows: ${beforeDomainCount}`)
  console.log(`Current operator_domain_registry rows: ${beforeLegacyCount}`)
  console.log('Note: Step 5 sync reads from domain_operator_registry (country-scoped). operator_domain_registry is the legacy global table.')

  let records = curatedMobileOperators()
  console.log(`Loaded ${records.length} curated operators.`)

  if (!curatedOnly) {
    try {
      const downloaded = await downloadMccMncDataset()
      const parsed = parseMccMncRecords(downloaded)
      console.log(`Downloaded ${downloaded.length} MCC/MNC records, parsed ${parsed.length} unique country operators.`)
      const merged = new Map<string, (typeof records)[number]>()
      for (const row of [...records, ...parsed]) {
        merged.set(`${row.countryIso3}:${row.normalizedName}`, row)
      }
      records = [...merged.values()]
    } catch (error) {
      console.warn(
        'Failed to download MCC/MNC dataset, continuing with curated operators only:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  const upserted = await upsertDomainOperatorRegistryRows(records)
  const legacySynced = await syncLegacyOperatorDomainRegistry(records)
  const afterDomainCount = await countDomainOperatorRegistry()
  const afterLegacyCount = await countLegacyOperatorDomainRegistry()

  const byCountry = new Map<string, number>()
  for (const row of records) {
    byCountry.set(row.countryIso3, (byCountry.get(row.countryIso3) ?? 0) + 1)
  }

  console.log(`Upserted ${upserted} rows into domain_operator_registry (now ${afterDomainCount} total).`)
  console.log(`Synced ${legacySynced} country-scoped rows into operator_domain_registry (now ${afterLegacyCount} total).`)
  console.log('Countries covered:', [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([iso3, count]) => `${iso3}(${count})`).join(', '))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
