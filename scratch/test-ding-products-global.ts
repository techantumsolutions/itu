import * as fs from 'fs'
import * as path from 'path'

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (!match) continue
    const key = match[1]
    let value = match[2] || ''
    if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
      value = value.substring(1, value.length - 1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnv()

async function testProducts() {
  const apiKey = (process.env.DING_API_KEY || '').trim()
  if (!apiKey) {
    console.error('DING_API_KEY is required (set it in .env)')
    process.exit(1)
  }
  const url = 'https://api.dingconnect.com/api/V1/GetProducts'

  console.log(`Testing URL: ${url}`)
  try {
    const res = await fetch(url, {
      headers: {
        api_key: apiKey,
        'Content-Type': 'application/json',
      },
    })
    console.log(`Status: ${res.status}`)
    const text = await res.text()
    console.log(`Response length: ${text.length}`)
    try {
      const data = JSON.parse(text)
      console.log(`ResultCode: ${data.ResultCode}`)
      console.log(`Number of items: ${data.Items ? data.Items.length : 0}`)
      if (data.Items && data.Items.length > 0) {
        console.log(`First item sample SkuCode:`, data.Items[0].SkuCode)
        console.log(`Sample item JSON:`, JSON.stringify(data.Items[0], null, 2))
      }
    } catch {
      console.log(`Response is not JSON (first 500 chars): ${text.slice(0, 500)}`)
    }
  } catch (err: any) {
    console.error(`Fetch error:`, err.message)
  }
}

void testProducts()
