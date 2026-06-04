async function testProviders() {
  const apiKey = 'KBJTB0y1UHj6p48GSsaiC4'
  const url = 'https://api.dingconnect.com/api/V1/GetProviders'
  
  console.log(`Testing URL: ${url}`)
  try {
    const res = await fetch(url, {
      headers: {
        'api_key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    console.log(`Status: ${res.status}`)
    const text = await res.text()
    console.log(`Response length: ${text.length}`)
    try {
      const data = JSON.parse(text)
      console.log(`ResultCode: ${data.ResultCode}`)
      console.log(`Number of items: ${data.Items ? data.Items.length : 0}`)
      if (data.Items && data.Items.length > 0) {
        console.log(`First item sample:`, JSON.stringify(data.Items[0], null, 2))
      }
    } catch {
      console.log(`Response is not JSON (first 500 chars): ${text.slice(0, 500)}`)
    }
  } catch (err: any) {
    console.error(`Fetch error:`, err.message)
  }
}

testProviders()
