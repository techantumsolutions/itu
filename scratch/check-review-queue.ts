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
  console.log('Querying classification_review_queue...')
  const res = await supabaseRest('classification_review_queue?select=id,entity_type,entity_name,category,confidence,status&limit=10', { cache: 'no-store' })
  if (res.ok) {
    const data = await res.json()
    console.log('Sample Review Queue Entries:')
    console.table(data)
  }

  const countRes = await supabaseRest('classification_review_queue?select=id&limit=1', {
    headers: { Prefer: 'count=exact' },
    cache: 'no-store'
  })
  const range = countRes.headers.get('content-range')
  console.log(`Total queue size: ${range ? range.split('/')[1] : 'N/A'}`)
}

test()
