/**
 * One-time seed of the static canonical countries table from country-calling-code.
 *   npm run db:seed-countries
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { runtimeEnv } from '../lib/env/runtime'
import { supabaseRest } from '../lib/db/supabase-rest'
import { buildCountrySeedRecords, findMissingSeedCoverage } from '../lib/aggregator/country-seed-source'

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

  if (!runtimeEnv('SUPABASE_URL') || !runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const records = buildCountrySeedRecords()
  console.log(`Prepared ${records.length} country records from country-calling-code.`)

  const payload = records.map((record) => ({
    ...record,
    min_length: 10,
    max_length: 15,
  }))

  let inserted = 0
  let skipped = 0

  for (const record of payload) {
    const res = await supabaseRest('countries', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(record),
    })

    if (res.ok) {
      if (res.status === 201) inserted += 1
      else skipped += 1
      continue
    }

    const errorText = await res.text()
    if (errorText.includes('23505')) {
      skipped += 1
      continue
    }

    console.error(`Failed to seed country ${record.iso3}:`, errorText)
    process.exit(1)
  }

  const finalRes = await supabaseRest('countries?select=id,iso2,iso3&limit=1000', { cache: 'no-store' })
  const finalRows = finalRes.ok ? ((await finalRes.json()) as Array<{ id: string; iso2: string; iso3: string }>) : []
  const missing = findMissingSeedCoverage(finalRows)

  console.log(
    `Seed complete. Inserted ${inserted}, skipped ${skipped} existing conflicts. ` +
      `Table has ${finalRows.length} rows; ${missing.length} canonical countries still missing.`,
  )

  if (missing.length > 0) {
    const preview = missing
      .slice(0, 10)
      .map((record) => `${record.iso3}/${record.iso2} (${record.name})`)
      .join(', ')
    console.warn(`Still missing: ${preview}${missing.length > 10 ? ', ...' : ''}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
