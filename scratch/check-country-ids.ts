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

async function inspect() {
  loadDotEnv()
  console.log('--- Unique country_id in system_operators ---')
  const res = await supabaseRest('system_operators?select=country_id&limit=10000', { cache: 'no-store' })
  if (!res.ok) {
    console.error('Failed to query:', await res.text())
    return
  }
  const ops = await res.json() as any[]
  const uniqueIds = Array.from(new Set(ops.map(o => o.country_id)))
  console.log('Unique country_id count:', uniqueIds.length)
  console.log(uniqueIds)

  console.log('\n--- Records in countries table ---')
  const cRes = await supabaseRest('countries?select=*&limit=1000', { cache: 'no-store' })
  if (!cRes.ok) {
    console.error('Failed to query countries:', await cRes.text())
    return
  }
  const countries = await cRes.json() as any[]
  console.log('Countries count:', countries.length)
  console.log(countries.map(c => `${c.id} (${c.name})`))
}

inspect().catch(console.error)
