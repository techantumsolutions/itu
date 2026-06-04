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
        process.env[key] = value
      }
    }
  }
}

loadEnv()

async function testUrl(baseUrl: string) {
  const apiKey = (process.env.DTONE_API_KEY || '').trim()
  const apiSecret = (process.env.DTONE_API_SECRET || '').trim()
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  
  console.log(`\nTesting DT One Base URL: ${baseUrl}`)
  console.log(`Using API Key: ${apiKey}`)
  
  try {
    const res = await fetch(`${baseUrl}/v1/products?page=1&per_page=1`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }
    })
    console.log(`Status: ${res.status}`)
    const text = await res.text()
    console.log(`Response (first 200 chars): ${text.slice(0, 200)}`)
  } catch (err: any) {
    console.error(`Fetch error:`, err.message)
  }
}

async function run() {
  await testUrl('https://preprod-dvs-api.dtone.com')
  await testUrl('https://dvs-api.dtone.com')
}

run()
