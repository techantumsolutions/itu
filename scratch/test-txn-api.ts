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
  const ids = [
    '30999d53-50d1-4dc0-aa9c-6980565bad3b',
    'd219befd-03c4-4f45-b6e9-4d8aae6a1ef0',
    '98da587f-512e-4377-a976-8258f45dc355',
    'd1653c5a-719d-4b53-8cc6-73b689952804',
    '3d20b5ad-7aec-4162-b318-0764f20ef3a4',
    '38e060ae-f07a-477d-913b-606dbfee8509',
    'f5b5c611-7f62-4f0d-96d0-174e84fd981b'
  ]
  const res = await supabaseRest(`transactions?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,type,status,metadata,recharge_orders(provider,status)`)
  if (res.ok) {
    const data = await res.json()
    console.log('Matching transactions:')
    console.log(JSON.stringify(data, null, 2))
  } else {
    console.error('Failed transactions query:', await res.text())
  }
}

test().catch(console.error)
