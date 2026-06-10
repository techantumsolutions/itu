async function run() {
  const countries = ['IN', 'GT', 'AF'];
  for (const c of countries) {
    console.log(`\n=================== COUNTRY: ${c} ===================`);
    const opRes = await fetch(`http://localhost:3000/api/providers?countryCode=${c}`);
    const opData = await opRes.json() as { providers?: any[] };
    const providers = opData.providers || [];
    if (!providers.length) {
      console.log(`No operators found for ${c}`);
      continue;
    }
    const pCode = providers[0].code;
    console.log(`Operator: ${providers[0].shortName || providers[0].name} (code: ${pCode})`);
    
    const plansRes = await fetch(`http://localhost:3000/api/plans?countryId=${c}&operatorId=${pCode}&limit=15`);
    const plansData = await plansRes.json() as { plans?: any[] };
    const plans = plansData.plans || [];
    console.log(`Loaded ${plans.length} plans:`);
    for (const p of plans) {
      console.log(`- [Name]: ${p.planName}`);
      console.log(`  [Benefits]: ${p.benefits}`);
      console.log(`  [DB Type]: ${p.type}`);
    }
  }
}
run().catch(console.error);
