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

async function run() {
  console.log('=== DETAILED INSPECTION OF RECENT RECHARGE ORDERS ===')
  try {
    const res = await supabaseRest('recharge_orders?select=id,transaction_id,user_id,status,phone_number,created_at&order=created_at.desc&limit=10', { cache: 'no-store' })
    if (res.ok) {
      const rows = await res.json() as any[]
      console.log(JSON.stringify(rows, null, 2))
    } else {
      console.log('Failed:', await res.text())
    }
  } catch (err) {
    console.error('Error:', err)
  }
}

run()
