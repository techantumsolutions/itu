import { supabaseRest } from '../lib/db/supabase-rest'
import * as fs from 'fs'
import * as path from 'path'

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let value = match[2] || ''
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.substring(1, value.length - 1)
        }
        process.env[key] = value.trim()
      }
    }
  }
}

loadEnv()

async function test() {
  console.log('Querying refunds table...')
  try {
    const res = await supabaseRest('refunds?limit=1')
    console.log('Status:', res.status)
    if (res.ok) {
      const data = await res.json()
      console.log('SUCCESS: refunds table exists! Data sample:', data)
    } else {
      console.error('FAILED: status was', res.status, await res.text())
    }
  } catch (err) {
    console.error('ERROR:', err)
  }
}

test().catch(console.error)
