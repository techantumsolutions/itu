const apiKey = 'Pie2l2ebftA1ZE8G'
const apiSecret = 'sk_test_4bbGQFy0LAAK0RHw6bnHnaiq7qwEqjUV'
const baseUrl = 'https://sandbox.valuetopup.com/api/v2'

async function run() {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const url = `${baseUrl}/catalog/skus`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  })
  const json = await response.json()
  console.log('Response keys:', Object.keys(json))
  if (json.payLoad && json.payLoad.length > 0) {
    console.log('Total SKUs:', json.payLoad.length)
    console.log('First SKU in payLoad:', JSON.stringify(json.payLoad[0], null, 2))
  }
}

run()
