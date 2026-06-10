import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js'
import { supabaseRest } from '../lib/db/supabase-rest'

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

async function run() {
  loadDotEnv()
  console.log('Seeding countries table dial prefixes...')

  // Fetch all countries in the database
  const getRes = await supabaseRest('countries?select=*&limit=1000', { cache: 'no-store' })
  if (!getRes.ok) {
    console.error('Failed to fetch countries from database:', await getRes.text())
    return
  }
  const dbCountries = await getRes.json() as any[]
  console.log(`Fetched ${dbCountries.length} countries from DB.`)

  // Resolve and update dial prefix
  let updatedCount = 0
  for (const c of dbCountries) {
    let callingCode = ''
    try {
      callingCode = getCountryCallingCode(c.iso2.toUpperCase() as any)
    } catch {
      // Fallback if country code is not found in libphonenumber-js
      continue
    }

    const expectedPrefix = '+' + callingCode
    if (c.dial_prefix !== expectedPrefix) {
      console.log(`Updating ${c.name} (${c.iso2}): "${c.dial_prefix}" -> "${expectedPrefix}"`)
      const patchRes = await supabaseRest(`countries?id=eq.${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ dial_prefix: expectedPrefix })
      })
      if (!patchRes.ok) {
        console.error(`Failed to patch country ${c.id}:`, await patchRes.text())
      } else {
        updatedCount++
      }
    }
  }

  console.log(`Successfully updated dial prefix for ${updatedCount} countries.`)
}

run().catch(console.error)
