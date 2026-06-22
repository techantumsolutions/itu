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

async function main() {
  const tables = ['internal_plans', 'system_plans', 'provider_plans_raw']
  for (const t of tables) {
    const res = await supabaseRest(`${t}?limit=5`)
    if (res.ok) {
      const rows = await res.json() as any[]
      console.log(`Table ${t} row count: ${rows.length}`)
      if (rows.length > 0) {
        console.log(`First row keys:`, Object.keys(rows[0]))
        console.log(`First row:`, rows[0])
      }
    } else {
      console.error(`Failed to query ${t}:`, await res.text())
    }
  }
}

main().catch(console.error)
