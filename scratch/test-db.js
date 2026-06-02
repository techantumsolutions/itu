
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const email = 'test-admin-' + Date.now() + '@example.com';
  console.log('Creating auth user:', email);

  // 1. Create auth user
  const authRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: 'password123', email_confirm: true })
  });
  const authData = await authRes.json();
  if (!authRes.ok) { console.error('Auth Error:', authData); return; }
  
  const userId = authData.id;
  console.log('Auth user created:', userId);

  // Wait a sec for any trigger
  await new Promise(r => setTimeout(r, 1000));

  // 2. Fetch profile
  const pRes1 = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY }
  });
  console.log('Profile after auth insert:', await pRes1.json());

  // 3. Upsert profile with app_role: 'admin'
  console.log('Upserting to admin...');
  const upsertRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify([{ id: userId, email, app_role: 'admin', updated_at: new Date().toISOString() }])
  });
  console.log('Upsert result status:', upsertRes.status);
  console.log('Upsert result body:', await upsertRes.json());
}
run().catch(console.error);

