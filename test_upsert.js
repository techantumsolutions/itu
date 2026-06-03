const fs = require('fs');

async function testPostgrestUpsert() {
  const envRaw = fs.readFileSync('.env', 'utf8');
  let url = '';
  let key = '';
  envRaw.split('\n').forEach(line => {
    if (line.startsWith('SUPABASE_URL=')) url = line.substring('SUPABASE_URL='.length).trim().replace(/"/g, '');
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.substring('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/"/g, '');
  });

  const baseUrl = url.replace(/\/$/, '');
  
  // First, set it to 'user' using PATCH to ensure it's in a known state
  const id = 'c5ac15f4-983c-47da-9412-19d1c39cf91b';
  
  console.log('Setting to user via PATCH...');
  await fetch(`${baseUrl}/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_role: 'user' })
  });

  console.log('Now testing POST with merge-duplicates...');
  const pr = await fetch(`${baseUrl}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { 
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation' 
    },
    body: JSON.stringify([
      {
        id: id,
        email: 'sunnyrock0110@gmail.com',
        app_role: 'admin'
      },
    ]),
  })

  console.log('Status:', pr.status);
  console.log('Body:', await pr.text());
}

testPostgrestUpsert();
