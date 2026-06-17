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
        process.env[key] = value
      }
    }
  }
}

loadEnv()

async function testTable(tableName: string) {
  try {
    const res = await supabaseRest(`${tableName}?limit=1`)
    console.log(`Table ${tableName}: Status = ${res.status}`)
    if (!res.ok) {
      console.log(`Table ${tableName}: Error = ${await res.text()}`)
    }
  } catch (e) {
    console.error(`Table ${tableName} threw error:`, e)
  }
}

async function run() {
  const tables = [
    'profiles',
    'wallets',
    'transactions',
    'wallet_ledger',
    'payment_events',
    'refunds',
    'recharge_orders',
    'support_tickets',
    'ticket_messages',
    'ticket_notes',
    'media_assets',
    'ads',
    'ad_events',
    'app_settings',
    'user_preferences',
    'notification_preferences',
    'service_fee_rules',
    'transaction_limit_rules',
    'promo_codes',
    'promo_redemptions',
    'reward_accounts',
    'reward_ledger',
    'reward_rules',
    'reconciliation_reports',
    'reconciliation_discrepancies'
  ];
  for (const table of tables) {
    await testTable(table);
  }
}

run()
