/**
 * End-to-end test: detectPublicOperator for India, Guatemala, Afghanistan
 * using only countries.dial_prefix as source of truth.
 */
const tests = [
  { name: 'India', phone: '919876543210', expectedCountry: 'IN' },
  { name: 'Guatemala', phone: '50225551234', expectedCountry: 'GT' },
  { name: 'Afghanistan', phone: '93701234567', expectedCountry: 'AF' },
]

async function run() {
  for (const test of tests) {
    const res = await fetch(`http://localhost:3000/api/operator/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: test.phone, countryCode: 'US' }), // Use US as default to force detection
    })
    const data = await res.json()
    const pass = data.country === test.expectedCountry
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${test.name}: phone=${test.phone} expected=${test.expectedCountry} got=${data.country} operator=${data.operator}`)
    console.log('  Full response:', JSON.stringify(data))
  }
}

run().catch(console.error)
