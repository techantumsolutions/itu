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
  const res = await supabaseRest('lcr_v2_recharge_attempts?select=id,distributor_ref,status,provider_adapter,selected_provider_id,routing_decision,attempts&limit=5')
  if (res.ok) {
    const data = await res.json()
    console.log('Attempts query successful!')
    console.log(JSON.stringify(data, null, 2))
  } else {
    console.error('Failed attempts query:', await res.text())
  }
}

test().catch(console.error)
