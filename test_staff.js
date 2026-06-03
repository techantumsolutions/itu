const fs = require('fs');

async function testCreateStaff() {
  const envRaw = fs.readFileSync('.env', 'utf8');
  let url = '';
  let key = '';
  envRaw.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
  });

  // Since we are running locally, we need to call the Next.js API route directly.
  // The API route requires 'sb-access-token' for the super_admin.
  // We can just bypass that by writing a temporary API route, or we can use the Supabase REST API directly to test the patch.
  
  // Let's create an auth user using supabaseAdminCreateUser logic
  let supaUrl = '';
  let supaKey = '';
  envRaw.split('\n').forEach(line => {
    if (line.startsWith('SUPABASE_URL=')) supaUrl = line.substring('SUPABASE_URL='.length).trim().replace(/"/g, '');
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supaKey = line.substring('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/"/g, '');
  });
  
  const baseUrl = supaUrl.replace(/\/$/, '');
  
  console.log("Creating user via GoTrue...");
  const res = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': supaKey,
      'Authorization': `Bearer ${supaKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: "test_staff_99@itu.com",
      password: "password123",
      email_confirm: true,
      user_metadata: { name: "Test Staff" },
    })
  });
  
  const j = await res.json();
  if (!res.ok) {
     console.error("Failed to create auth user:", j);
     return;
  }
  
  console.log("Auth user created:", j.id);
  
  // Now immediately try to patch the profile
  console.log("Patching profile...");
  const pr = await fetch(`${baseUrl}/rest/v1/profiles?id=eq.${j.id}`, {
    method: 'PATCH',
    headers: {
      'apikey': supaKey,
      'Authorization': `Bearer ${supaKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      app_role: 'admin',
      admin_permissions: { help: true },
      updated_at: new Date().toISOString(),
    })
  });
  
  const pJson = await pr.json();
  console.log("Patch result:", pJson);
}

testCreateStaff();
