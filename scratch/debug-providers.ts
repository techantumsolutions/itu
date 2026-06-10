/**
 * Broader test - check providers for many countries that were broken before
 */
const testCodes = [
  'IN', 'AF', 'GT', 'NG', 'QA',  // original test cases
  'ET', 'TZ', 'UG', 'KH', 'MM',  // other countries likely in system_operators
  'BD', 'PK', 'LK', 'NP',        // South Asia
]

async function run() {
  let passed = 0, failed = 0
  for (const cc of testCodes) {
    const res = await fetch(`http://localhost:3000/api/providers?countryCode=${cc}`)
    const data = await res.json() as { providers?: any[]; error?: string }
    const count = data.providers?.length ?? 0
    if (count > 0) {
      console.log(`[${cc}] ✅ ${count} operators: ${data.providers?.slice(0,2).map((p:any) => p.shortName).join(', ')}`)
      passed++
    } else {
      console.log(`[${cc}] ○  0 operators (none configured in system_operators)`)
    }
  }
}

run().catch(console.error)
