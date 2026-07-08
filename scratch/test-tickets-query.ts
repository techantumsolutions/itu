import { supabaseRest } from '../lib/db/supabase-rest'

async function run() {
  const res = await supabaseRest(
    'support_tickets?select=id,user_id,user_email,user_name,profiles(name,email,phone,country_code)&limit=5',
    { cache: 'no-store' }
  )
  if (!res.ok) {
    console.error('Fetch failed:', await res.text())
    return
  }
  const data = await res.json()
  console.log('Returned data structure:', JSON.stringify(data, null, 2))
}

run().catch(console.error)
