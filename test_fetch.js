const fs = require('fs');

async function testFetchProfile() {
  const envRaw = fs.readFileSync('.env', 'utf8');
  let url = '';
  let key = '';
  envRaw.split('\n').forEach(line => {
    if (line.startsWith('SUPABASE_URL=')) url = line.substring('SUPABASE_URL='.length).trim().replace(/"/g, '');
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.substring('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/"/g, '');
  });
  
  const baseUrl = url.replace(/\/$/, '');
  
  const pr = await fetch(`${baseUrl}/rest/v1/profiles?email=eq.test_staff_99@itu.com`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  
  const pJson = await pr.json();
  console.log("Fetch result by email:", pJson);
}

testFetchProfile();
