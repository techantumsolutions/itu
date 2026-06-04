import * as fs from 'fs'
import * as path from 'path'

async function checkRegions() {
  const apiKey = 'KBJTB0y1UHj6p48GSsaiC4'
  const url = 'https://api.dingconnect.com/api/V1/GetProducts'
  
  console.log(`Fetching from: ${url}`)
  try {
    const res = await fetch(url, {
      headers: {
        'api_key': apiKey,
        'Content-Type': 'application/json'
      }
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

checkRegions()
