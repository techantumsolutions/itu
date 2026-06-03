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
  
  const res = await fetch(`${baseUrl}/rest/v1/profiles?select=id,email,app_role,admin_permissions`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const data = await res.json();
  
  // Find all profiles that should be admin but aren't
  const toFix = data.filter(p => {
    // If they have admin permissions set to an object (not null)
    if (p.admin_permissions && typeof p.admin_permissions === 'object') {
       if (p.app_role !== 'admin' && p.app_role !== 'super_admin') {
         return true;
       }
    }
    return false;
  });

  console.log(`Found ${toFix.length} profiles to fix`);

  for (const p of toFix) {
    console.log(`Fixing ${p.email}...`);
    const updateRes = await fetch(`${baseUrl}/rest/v1/profiles?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ app_role: 'admin' })
    });
    console.log('Update status:', updateRes.status);
  }
}

fixAdmins();
