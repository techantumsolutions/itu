async function run() {
  const c = 'IN';
  const opRes = await fetch(`http://localhost:3000/api/providers?countryCode=${c}`);
  const opData = await opRes.json() as { providers?: any[] };
  const providers = opData.providers || [];
  if (!providers.length) {
    console.log(`No operators found for ${c}`);
    return;
  }
  const pCode = providers[0].code;
  console.log(`Testing Operator: ${providers[0].shortName || providers[0].name} (code: ${pCode})`);
  
  const plansRes = await fetch(`http://localhost:3000/api/plans?countryId=${c}&operatorId=${pCode}`);
  const plansData = await plansRes.json() as { plans?: any[] };
  const plans = plansData.plans || [];
  console.log(`Loaded ${plans.length} plans. Sample classification:`);
  
  const typesCount = { topup: 0, unlimited: 0, data: 0 };
  
  for (const p of plans) {
    typesCount[p.type as 'topup' | 'unlimited' | 'data'] = (typesCount[p.type as 'topup' | 'unlimited' | 'data'] || 0) + 1;
    console.log(`- [${p.type.toUpperCase()}] ${p.planName} | ${p.benefits.slice(0, 80)}...`);
  }
  
  console.log('\nSummary count by type:', typesCount);
}
run().catch(console.error);
