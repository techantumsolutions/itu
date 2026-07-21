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

async function checkRegions() {
  const apiKey = (process.env.DING_API_KEY || '').trim()
  if (!apiKey) {
    console.error('DING_API_KEY is required (set it in .env)')
    process.exit(1)
  }
  const url = 'https://api.dingconnect.com/api/V1/GetProducts'

  console.log(`Fetching from: ${url}`)
  try {
    const res = await fetch(url, {
      headers: {
        api_key: apiKey,
        'Content-Type': 'application/json',
      },
    })
    const data = await res.json()
    const items = data.Items || []

    console.log(`Total products: ${items.length}`)

    const regions: Record<string, number> = {}
    const missingRegion: any[] = []

    for (const item of items) {
      const region = item.RegionCode
      if (!region) {
        missingRegion.push(item)
      } else {
        regions[region] = (regions[region] || 0) + 1
      }
    }

    console.log(`Missing RegionCode: ${missingRegion.length}`)
    console.log(`Distinct RegionCodes: ${Object.keys(regions).length}`)
    console.log(`Sample RegionCodes count:`, Object.entries(regions).slice(0, 20))
  } catch (err: any) {
    console.error(`Error:`, err.message)
  }
}

void checkRegions()
