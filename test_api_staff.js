const fs = require('fs');

async function runTest() {
  const envRaw = fs.readFileSync('.env', 'utf8');
  let url = 'http://localhost:3000';

  // 1. Log in as super admin
  const loginRes = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@itu.com',
      password: 'admin',
      source: 'admin' // to bypass turnstile and 2fa
    })
  });
  
  if (!loginRes.ok) {
     console.log("Login failed", await loginRes.text());
     return;
  }
  
  const cookies = loginRes.headers.get('set-cookie');
  console.log("Logged in, cookies:", cookies);
  
  // 2. Create staff member
  const createRes = await fetch(`${url}/api/admin/staff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify({
      email: 'test_dashboard_staff@itu.com',
      name: 'Test Dashboard',
      permissions: { help: true }
    })
  });
  
  if (!createRes.ok) {
    console.log("Create failed with status:", createRes.status);
    console.log("Error body:", await createRes.text());
  } else {
    console.log("Create success:", await createRes.json());
  }
}

runTest();
