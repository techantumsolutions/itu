import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function run() {
  const res = await fetch(url + '/rest/v1/ads_creatives?select=*,campaign:ads_campaigns!inner(*)', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  })
  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))
}
run()
