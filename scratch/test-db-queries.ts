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
  console.log('Querying telecom reference catalog for GLOBE...')
  const res = await supabaseRest('telecom_reference_catalog?operator_name=eq.GLOBE&limit=1', { cache: 'no-store' })
  console.log('Status:', res.status, res.statusText)
  if (res.ok) {
    const data = await res.json()
    console.log('Data:', data)
  }

  console.log('Fetching all reference catalog entries...')
  const resAll = await supabaseRest('telecom_reference_catalog?limit=50', { cache: 'no-store' })
  if (resAll.ok) {
    const data = await resAll.json()
    console.log('All Reference entries:', data.map((d: any) => d.operator_name))
  }
}

test()
