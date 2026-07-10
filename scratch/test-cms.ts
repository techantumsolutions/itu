async function test() {
  console.log('Fetching homepage HTML...')
  try {
    const res = await fetch('http://localhost:3000/', { cache: 'no-store' })
    if (res.ok) {
      const html = await res.text()
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
      if (h1Match) {
        console.log('H1 found in server-rendered HTML:', JSON.stringify(h1Match[1].trim()))
      } else {
        console.log('H1 NOT found in HTML')
      }
    } else {
      console.log('Failed to fetch homepage:', res.status)
    }
  } catch (e: any) {
    console.error('Error fetching homepage:', e.message || e)
  }
}

test()
