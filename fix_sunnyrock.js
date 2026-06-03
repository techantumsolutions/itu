const fs = require('fs');

async function fixAdmins() {
  const envRaw = fs.readFileSync('.env', 'utf8');
  let url = '';
  let key = '';
  envRaw.split('\n').forEach(line => {
    if (line.startsWith('SUPABASE_URL=')) url = line.substring('SUPABASE_URL='.length).trim().replace(/"/g, '');
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.substring('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/"/g, '');
  });

  const baseUrl = url.replace(/\/$/, '');
  
  console.log(`Fixing sunnyrock0110@gmail.com...`);
  const updateRes = await fetch(`${baseUrl}/rest/v1/profiles?email=eq.sunnyrock0110@gmail.com`, {
    method: 'PATCH',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ app_role: 'admin' })
  });
  console.log('Update status:', updateRes.status);
  console.log('Update text:', await updateRes.text());
}

fixAdmins();
