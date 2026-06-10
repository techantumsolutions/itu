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

const NANP_EXCEPTIONS: Record<string, string> = {
  AS: '1-684', // American Samoa
  AI: '1-264', // Anguilla
  AG: '1-268', // Antigua and Barbuda
  BS: '1-242', // Bahamas
  BB: '1-246', // Barbados
  BM: '1-441', // Bermuda
  VG: '1-284', // British Virgin Islands
  KY: '1-345', // Cayman Islands
  DM: '1-767', // Dominica
  DO: '1-809', // Dominican Republic
  GD: '1-473', // Grenada
  GU: '1-671', // Guam
  JM: '1-876', // Jamaica
  MS: '1-664', // Montserrat
  MP: '1-670', // Northern Mariana Islands
  PR: '1-787', // Puerto Rico
  KN: '1-869', // Saint Kitts and Nevis
  LC: '1-758', // Saint Lucia
  VC: '1-784', // Saint Vincent and the Grenadines
  SX: '1-721', // Sint Maarten
  TT: '1-868', // Trinidad and Tobago
  TC: '1-649', // Turks and Caicos Islands
  VI: '1-340', // United States Virgin Islands
};

async function run() {
  console.log('Fetching all countries from DB...');
  const res = await supabaseRest('countries?select=id,iso2,iso3,dial_prefix&limit=1000', {
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error('Failed to fetch countries:', res.status, await res.text());
    return;
  }
  const rows = (await res.json()) as {
    id: string;
    iso2: string | null;
    iso3: string | null;
    dial_prefix: string | null;
  }[];

  console.log(`Loaded ${rows.length} countries from DB. Syncing exceptions...`);
  let updated = 0;
  
  for (const row of rows) {
    if (!row.iso2) continue;
    const iso2Upper = row.iso2.toUpperCase();
    const correctPrefix = NANP_EXCEPTIONS[iso2Upper];
    if (!correctPrefix) continue;

    // Normalize comparison: remove any '+' and spaces/hyphens
    const normDb = (row.dial_prefix ?? '').replace(/\D/g, '');
    const normCorrect = correctPrefix.replace(/\D/g, '');

    if (normDb !== normCorrect) {
      console.log(`Updating ${row.iso2} (${row.iso3}): '${row.dial_prefix}' -> '${correctPrefix}'`);
      const upd = await supabaseRest(`countries?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ dial_prefix: correctPrefix }),
      });
      if (upd.ok) {
        updated++;
      } else {
        console.error(`Failed to update ${row.iso2}:`, upd.status, await upd.text());
      }
    }
  }

  console.log(`\nSync finished. Updated ${updated} countries.`);
}
run().catch(console.error);
