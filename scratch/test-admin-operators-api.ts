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

import { GET } from '../app/api/admin/aggregator/operators/route'

async function test() {
  console.log('Invoking GET /api/admin/aggregator/operators route...')
  const request = new Request('http://localhost:3000/api/admin/aggregator/operators', {
    headers: {
      'x-user-role': 'admin',
      'x-user-email': 'admin@itu.com',
      'x-user-id': 'admin-id'
    }
  })

  try {
    const response = await GET(request)
    console.log('Response Status:', response.status)
    const body = await response.json()
    console.log('Response Keys:', Object.keys(body))
    console.log(`Raw Operators Count: ${body.rawOperators?.length}`)
    console.log(`System Operators Count: ${body.systemOperators?.length}`)
    
    if (body.systemOperators && body.systemOperators.length > 0) {
      console.log('Sample System Operator:', body.systemOperators[0])
      
      const statuses = body.systemOperators.map((o: any) => o.status)
      const uniqueStatuses = Array.from(new Set(statuses))
      console.log('Unique System Operator Statuses in Response:', uniqueStatuses)

      const activeOps = body.systemOperators.filter((o: any) => o.status === 'ACTIVE')
      console.log(`Active System Operators in Response: ${activeOps.length}`)
    }
  } catch (error) {
    console.error('Error invoking GET route:', error)
  }
}

test()
