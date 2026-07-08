const fs = require('fs')
const path = require('path')

async function run() {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8')
  const env = {}
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      const key = match[1]
      let value = match[2] || ''
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1)
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1)
      }
      env[key] = value.trim()
    }
  }

  const baseRaw = env['SUPABASE_URL']
  const key = env['SUPABASE_SERVICE_ROLE_KEY']
  if (!baseRaw || !key) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env')
    return
  }

  const base = baseRaw.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
  const url = `${base}/rest/v1/support_tickets?select=id,user_id,user_email,user_name,profiles(name,email,phone,country_code)&limit=5`

  console.log('Fetching:', url)
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  })

  if (!res.ok) {
    console.error('Fetch failed:', res.status, await res.text())
    return
  }

  const data = await res.json()
  console.log('Result:')
  console.log(JSON.stringify(data, null, 2))
}

run().catch(console.error)
