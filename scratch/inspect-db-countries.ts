import fs from 'fs';
import path from 'path';

// Inline .env loader
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).replace(/^['"]|['"]$/g, '').trim();
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.error('Failed to load env:', e);
}

import { supabaseRest } from '../lib/db/supabase-rest';

async function run() {
  const codes = ['AS', 'AI', 'AG', 'JM', 'PR', 'BS', 'CA', 'US'];
  
  // Let's query countries from database
  const dbRes = await supabaseRest('countries?iso2=in.(AS,AI,AG,JM,PR,BS,CA,US)&select=*');
  if (dbRes.ok) {
    const rows = await dbRes.json();
    console.log('\nDB Rows:');
    for (const r of rows) {
      console.log(`Name: ${r.country_name} | ISO2: ${r.iso2} | ISO3: ${r.iso3} | Dial Prefix: ${r.dial_prefix}`);
    }
  } else {
    console.log('Supabase query failed:', dbRes.status, await dbRes.text());
  }
}
run().catch(console.error);
