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
  console.log('Finding operators with country_id length < 3...')
  const res = await supabaseRest('system_operators?select=id,system_operator_name,country_id&limit=10000', { cache: 'no-store' })
  if (!res.ok) {
    console.error('Failed to query:', await res.text())
    return
  }
  const ops = await res.json() as any[]
  const invalid = ops.filter(op => !op.country_id || op.country_id.length < 3)
  console.log(`Found ${invalid.length} invalid/short country operators:`)
  console.log(invalid)
}

inspect().catch(console.error)
