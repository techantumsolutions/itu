import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
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
  const res = await supabaseRest('countries?select=id,name,iso2,iso3,dial_prefix&limit=1000', { cache: 'no-store' })
  if (!res.ok) { console.error(await res.text()); return }
  const rows = await res.json() as any[]
  const empty = rows.filter(r => !r.dial_prefix || r.dial_prefix.trim() === '')
  console.log('Total:', rows.length, '  Missing dial_prefix:', empty.length)
  console.log('Sample missing (first 5):', empty.slice(0, 5).map((c: any) => ({ iso2: c.iso2, iso3: c.iso3, name: c.name })))
}

run().catch(console.error)
