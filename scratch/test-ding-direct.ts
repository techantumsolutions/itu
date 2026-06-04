async function testDirect() {
  const apiKey = 'KBJTB0y1UHj6p48GSsaiC4'
  const urls = [
    'https://api.dingconnect.com/api/V1/GetCountries',
    'https://api.dingconnect.com/api/v1/GetCountries',
    'https://api.dingconnect.com/GetCountries'
  ]

  for (const url of urls) {
    console.log(`\nTesting URL: ${url}`)
    try {
      const res = await fetch(url, {
        headers: {
          'api_key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      console.log(`Status: ${res.status}`)
      const text = await res.text()
      console.log(`Response (first 200 chars): ${text.slice(0, 200)}`)
    } catch (err: any) {
      console.error(`Fetch error:`, err.message)
    }
  }
}

testDirect()
