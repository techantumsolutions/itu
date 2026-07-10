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

import { POST } from '../app/api/profile/update/check-unique/route'

async function test() {
  console.log('Testing check-unique API handler...')
  
  // Mock request with a phone number
  const request = new Request('http://localhost:3000/api/profile/update/check-unique', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Mock cookie
      'cookie': 'itu-user-id=fb9fde96-4dbf-47dc-9f0e-d7f43db487f9' // we can try any valid user ID or see what's in database
    },
    body: JSON.stringify({
      phone: '+919988776655'
    })
  })

  try {
    const response = await POST(request)
    console.log('Response Status:', response.status)
    const body = await response.json()
    console.log('Response Body:', body)
  } catch (error) {
    console.error('Error invoking POST route:', error)
  }
}

test()
