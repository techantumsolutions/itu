/**
 * Inspect real plan data from the API to see what fields actually contain
 */
async function run() {
  // Get India operators first
  const opRes = await fetch('http://localhost:3000/api/providers?countryCode=IN')
  const opData = await opRes.json() as { providers?: any[] }
  const firstOp = opData.providers?.[0]
  if (!firstOp) { console.log('No operators'); return }

  console.log('Operator:', firstOp.shortName, 'id:', firstOp.code)

  const res = await fetch(`http://localhost:3000/api/plans?countryId=IN&operatorId=${firstOp.code}&limit=5`)
  const data = await res.json() as { plans?: any[] }
  if (!data.plans?.length) { console.log('No plans'); return }

  console.log(`\n=== ${data.plans.length} plans for ${firstOp.shortName} ===`)
  for (const p of data.plans.slice(0, 5)) {
    console.log('\n--- Plan ---')
    console.log('planName:', p.planName)
    console.log('price_inr:', p.price_inr, '| price_eur:', p.price_eur)
    console.log('validity:', p.validity)
    console.log('data:', p.data)
    console.log('benefits:', p.benefits)
    console.log('tag:', p.tag)
    console.log('type:', p.type)
  }
}
run().catch(console.error)
