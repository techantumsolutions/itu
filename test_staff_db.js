const fs = require('fs');

async function testStaffCreate() {
  const envRaw = fs.readFileSync('.env', 'utf8');
  let url = '';
  let key = '';
  envRaw.split('\n').forEach(line => {
    if (line.startsWith('SUPABASE_URL=')) url = line.substring('SUPABASE_URL='.length).trim().replace(/"/g, '');
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.substring('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/"/g, '');
  });

  const baseUrl = url.replace(/\/$/, '');
  
  const createdId = 'e94329a4-9e0c-4605-87cc-a15cf0d93573'; // test_staff_99@itu.com ID
  const email = 'test_staff_99@itu.com';

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
        id: createdId,
        email: email,
        name: 'Test Staff',
        app_role: 'admin',
        admin_permissions: { help: true },
        updated_at: new Date().toISOString(),
      },
    ]),
  })

  console.log('Status:', pr.status);
  console.log('Body:', await pr.text());
}

testStaffCreate();
